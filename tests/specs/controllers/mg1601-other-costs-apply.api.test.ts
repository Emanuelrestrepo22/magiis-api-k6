// tests/specs/controllers/mg1601-other-costs-apply.api.test.ts
// MG-1601 (Ítems de otros costos restringidos por el tarifador del viaje) — contrato de API del ATP
// TM-1285, label `contrato-api` (decisión QA lead 19/10/2026: ni Carrier V1/V2 ni la app Chofer emiten
// `apply` hacia ese endpoint, así que AC3/AC4 solo se ejercen por API).
//
// Runs target ENV=test (carrier 1521): el catálogo de otros costos «QA F2 ...» del carrier 1521 solo existe
// en TEST; decisión QA lead 19/10 (contrato-api).
//
// PLAN (escenario <-> key Xray <-> oráculo)
//   TM-1414  POST carriers/{carrierId}/otherCosts/search
//            control sin apply y sin rateByCost (AC3) -> el catálogo completo = CARRIER_OTHER_COSTS con
//              DELETED = 0 (lectura en vivo; incluye los conceptos por costo, p. ej. el 143);
//            apply PAX / DRIVER sin rateByCost (AC4) -> solo ítems por venta (IS_BY_COST = 0) con el rol en
//              APPLY: lo ofrecido debe estar contenido en el conjunto de la base y ningún concepto por costo
//              ni el 143. El conjunto esperado se deriva en vivo (no se hardcodea 2/8: DRIVER pasó de 8 a 9
//              cuando se recrearon los 164-169). Un concepto del conjunto de la base que la API NO ofrece se
//              registra como observación (p. ej. el de otra moneda), no como falla del criterio.
//   Solo lectura (0 escrituras).
//
// Crédito: `tms_only` en cada test.

import { test, expect } from '@TestBase';
import { F2_TEST_ONLY_REASON, isF2Env } from '@data/f2';
import { observe } from '@data/f2/observe';
import { pace } from '@data/f2/pace';
import type { OtherCostApplyRole } from '@api/CarrierOtherCostApi';

interface CatalogRow {
	ID: number;
	APPLY: string | null;
	IS_BY_COST: number;
}

const CATALOG_SQL = `SELECT ID, APPLY, IS_BY_COST FROM CARRIER_OTHER_COSTS WHERE CARRIERACCOUNT_ID = :carrierId AND DELETED = 0 ORDER BY ID`;

function rolesOf(apply: string | null): string[] {
	return (apply ?? '').split(';').map((r) => r.trim());
}

test.describe('MG-1601: otherCosts/search con apply y sin rateByCost (contrato-api)', () => {
	test(
		'TM-1414: should return the full active catalogue when the search has no apply and no rateByCost (control)',
		{ annotation: { type: 'tms_only', description: 'TM-1414' } },
		async ({ carrierOtherCost, db, cfg }) => {
			test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
			test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): catálogo esperado no verificable.');
			const carrierId = cfg.carrierId;
			const catalogue = await db!.query<CatalogRow>(CATALOG_SQL, { carrierId });
			expect(catalogue.length, 'precondición: el carrier tiene conceptos activos').toBeGreaterThan(0);

			await pace();
			const items = await carrierOtherCost.searchCatalogue(carrierId);
			await observe('TM-1414-control-sin-apply', {
				endpoint: `POST carriers/${carrierId}/otherCosts/search`,
				variation: null,
				sentBody: { carrierId: String(carrierId), name: '', type: '', apply: null },
				status: 200,
				response: { total: items.length, ids: items.map((i) => i.id) }
			});
			expect(
				items.map((i) => i.id).sort((a, b) => a - b),
				'el catálogo sin apply debe coincidir con CARRIER_OTHER_COSTS (DELETED = 0)'
			).toEqual(catalogue.map((r) => r.ID));
			const byCost = catalogue.filter((r) => r.IS_BY_COST === 1).map((r) => r.ID);
			expect(byCost.length, 'precondición: el catálogo incluye conceptos por costo').toBeGreaterThan(0);
			for (const id of byCost)
				expect(
					items.map((i) => i.id),
					`el concepto por costo ${id} debe estar en el catálogo`
				).toContain(id);
		}
	);

	const roles: OtherCostApplyRole[] = ['PAX', 'DRIVER'];
	for (const role of roles) {
		test(
			`TM-1414: should offer only by-sale items that declare ${role} in APPLY when the search sends apply ${role} without rateByCost`,
			{ annotation: { type: 'tms_only', description: 'TM-1414' } },
			async ({ carrierOtherCost, db, cfg }) => {
				test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
				test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): conjunto esperado no verificable.');
				const carrierId = cfg.carrierId;
				const catalogue = await db!.query<CatalogRow>(CATALOG_SQL, { carrierId });
				const expectedBySale = catalogue
					.filter((r) => r.IS_BY_COST === 0 && rolesOf(r.APPLY).includes(role))
					.map((r) => r.ID);
				expect(expectedBySale.length, `precondición: hay conceptos por venta con ${role} en APPLY`).toBeGreaterThan(0);
				const byCost = catalogue.filter((r) => r.IS_BY_COST === 1).map((r) => r.ID);

				await pace();
				const items = await carrierOtherCost.searchWithApplyWithoutRateByCost(carrierId, role);
				const offered = items.map((i) => i.id).sort((a, b) => a - b);
				const missing = expectedBySale.filter((id) => !offered.includes(id));
				await observe(`TM-1414-apply-${role}`, {
					endpoint: `POST carriers/${carrierId}/otherCosts/search`,
					variation: { apply: role },
					sentBody: { carrierId: String(carrierId), name: '', type: '', apply: role },
					status: 200,
					response: { offered, expectedBySaleFromDb: expectedBySale, inDbButNotOffered: missing }
				});
				if (missing.length > 0) {
					test.info().annotations.push({
						type: 'observed',
						description: `Conceptos por venta con ${role} en la base que la API no ofrece: ${missing.join(', ')}`
					});
				}

				expect(offered.length, `apply ${role}: debe ofrecer al menos un concepto`).toBeGreaterThan(0);
				expect(
					offered.filter((id) => !expectedBySale.includes(id)),
					`apply ${role}: todo concepto ofrecido debe ser por venta y declarar ${role} en APPLY (base)`
				).toEqual([]);
				expect(
					offered.filter((id) => byCost.includes(id)),
					`apply ${role}: no debe ofrecer ningún concepto por costo`
				).toEqual([]);
			}
		);
	}
});
