// tests/specs/controllers/mg1537-gmt-travel-history.api.test.ts
// MG-1537-AC5 — contrato del ATP TM-1285, label `contrato-api`: el cierre GMT (22:00 ART = 01:00 UTC) copia a
// `TRAVEL_HISTORY` las cuatro columnas de otros costos de los viajes finalizados, iguales a las de `PRICEADDITIONAL`.
// PK-A (21/10/2026), plan docs/plans/PK-A-contrato-api-alta-*.md §5.7. SOLO LECTURA (SELECT): no hay ALLOW_MUTATIONS ni
// viajes creados; el cron no se dispara desde la API (Gherkin: «Cobertura NO-UI por naturaleza aceptada por el QA lead
// 19/10»).
//
// Runs target ENV=test (carrier 1521): los viajes de referencia y el cierre diario son de TEST.
//
// PLAN (escenario <-> key Xray <-> oráculo)
//   M0  Viajes de referencia 71192 / 71212 / 71160 (finalizados y copiados por el cierre del 14/10): una sola fila de
//       TRAVEL_HISTORY con HISTORIC_EMISSION_DATE informada, `ADDITIONAL_ID` presente y las cuatro columnas
//       (OTHERCOST, OTHER_COST_TOTAL_NOCOM, OTHER_COST_TOTAL_PRICE_COST, OTHER_COST_PRICE_COST_NOCOM) NO NULL e
//       iguales, columna a columna, a las de la fila fuente de PRICEADDITIONAL LEÍDA EN VIVO por `ADDITIONAL_ID`
//       (sin importes literales del Gherkin). Detecta corrupción o backfill de las filas de referencia.
//   M1  Dinámico, en una sola fase: todos los viajes STATE 6 del carrier cerrados por el GMT en los últimos
//       `GMT_HISTORY_LOOKBACK_DAYS` días (default 3) con fuente alcanzable: histórico == fuente en las cuatro columnas.
//       Es el que detecta una regresión del job. (El plan PK-A preveía dos fases con foto previa al cierre; no hace falta:
//       `ADDITIONAL_ID` conserva la fuente. Se saltea con motivo si no hay cierres comparables en la ventana.)
//   OBSERVADO, NO ASERTADO: el último «Then» del Gherkin (ítems de TRAVEL_OTHERCOST_HISTORY iguales a los de
//   TRAVEL_OTHERCOST). Se registra cuántos ítems hay por viaje (annotation `observed` + red-*.json); la comparación
//   contra TRAVEL_OTHERCOST queda como pregunta abierta P2 a Dev-BE/QA.
//   Fuera: el segundo punto de copia (INSERT_TRAVEL_HISTORY_NOPROCESSED), que el propio Gherkin excluye.
//
// Crédito: `tms_only` (cada test acredita solo TM-1416).

import { test, expect } from '@TestBase';
import { F2_TEST_ONLY_REASON, isF2Env } from '@data/f2';
import { observe } from '@data/f2/observe';
import {
	diffOtherCostColumns,
	listRecentClosedPairs,
	nullOtherCostColumns,
	readHistoryItems,
	readPriceAdditional,
	readTravelHistory
} from '@db/travelHistoryOracle';

/** Viajes de referencia del Gherkin de TM-1416 (copiados por el cierre GMT del 14/10/2026). */
const REFERENCE_TRAVELS = [71192, 71212, 71160];

const LOOKBACK_DAYS = Number(process.env.GMT_HISTORY_LOOKBACK_DAYS ?? '3');
const MAX_PAIRS = 200;

test.describe('MG-1537-AC5: el cierre GMT copia las columnas de otros costos a TRAVEL_HISTORY (contrato-api · solo lectura)', () => {
	test.beforeEach(({ db }) => {
		test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
		test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): la verificación es solo de DB.');
	});

	for (const travelId of REFERENCE_TRAVELS) {
		test(
			`TM-1416: should have copied the four other-cost columns of trip ${travelId} to TRAVEL_HISTORY equal to PRICEADDITIONAL`,
			{ annotation: { type: 'tms_only', description: 'TM-1416' } },
			async ({ db }) => {
				const history = await readTravelHistory(db!, travelId);
				test.skip(
					history.length === 0,
					`El viaje de referencia ${travelId} no existe en TRAVEL_HISTORY de este entorno.`
				);
				expect(history, `una sola fila de TRAVEL_HISTORY para el viaje ${travelId}`).toHaveLength(1);
				const row = history[0];
				expect(row.HISTORIC_EMISSION_DATE, 'HISTORIC_EMISSION_DATE informada (el cierre GMT lo copió)').not.toBeNull();
				expect(nullOtherCostColumns(row), 'las cuatro columnas de otros costos no deben ser NULL').toEqual([]);
				expect(row.ADDITIONAL_ID, 'ADDITIONAL_ID (fuente PRICEADDITIONAL) informado').not.toBeNull();

				const source = await readPriceAdditional(db!, row.ADDITIONAL_ID!);
				expect(source, `PRICEADDITIONAL ${row.ADDITIONAL_ID} debe seguir existiendo`).not.toBeNull();
				const items = await readHistoryItems(db!, row.ADDITIONAL_ID!);
				await observe(`TM-1416-viaje-${travelId}`, {
					endpoint: 'SELECT TRAVEL_HISTORY + PRICEADDITIONAL + TRAVEL_OTHERCOST_HISTORY',
					variation: { travelId },
					status: 200,
					response: { travelHistory: row, priceAdditional: source, travelOtherCostHistoryItems: items }
				});
				// Observado, no asertado (P2): ítems de TRAVEL_OTHERCOST_HISTORY vs TRAVEL_OTHERCOST.
				test.info().annotations.push({
					type: 'observed',
					description: `Viaje ${travelId}: ${items.length} ítem(s) en TRAVEL_OTHERCOST_HISTORY (PRICEADDITIONAL ${row.ADDITIONAL_ID}); su igualdad con TRAVEL_OTHERCOST no se asierta (pregunta abierta P2).`
				});

				expect(
					diffOtherCostColumns(row, source!),
					`columnas de TRAVEL_HISTORY distintas de PRICEADDITIONAL ${row.ADDITIONAL_ID} (viaje ${travelId})`
				).toEqual([]);
			}
		);
	}

	test(
		'TM-1416: should keep TRAVEL_HISTORY equal to PRICEADDITIONAL for the trips closed by the latest GMT runs',
		{ annotation: { type: 'tms_only', description: 'TM-1416' } },
		async ({ db, cfg }) => {
			const pairs = await listRecentClosedPairs(db!, {
				carrierId: cfg.carrierId,
				lookbackDays: LOOKBACK_DAYS,
				limit: MAX_PAIRS
			});
			const newest = pairs.reduce<string>((max, p) => {
				const when = String(p.history.HISTORIC_EMISSION_DATE);
				return when > max ? when : max;
			}, '');
			test.skip(
				pairs.length === 0,
				`Sin viajes STATE 6 cerrados por el GMT en los últimos ${LOOKBACK_DAYS} días con fuente PRICEADDITIONAL alcanzable: no hay nada que comparar.`
			);
			const mismatches = pairs
				.map((p) => ({ travelId: p.history.TRAVEL_ID, columns: diffOtherCostColumns(p.history, p.source) }))
				.filter((m) => m.columns.length > 0);
			await observe('TM-1416-cierres-recientes', {
				endpoint: 'SELECT TRAVEL_HISTORY JOIN PRICEADDITIONAL (ADDITIONAL_ID)',
				variation: { carrierId: cfg.carrierId, lookbackDays: LOOKBACK_DAYS, limit: MAX_PAIRS },
				status: 200,
				response: {
					comparedTravels: pairs.length,
					newestHistoricEmissionDate: newest,
					mismatches,
					comparedTravelIds: pairs.map((p) => p.history.TRAVEL_ID)
				}
			});
			expect(
				mismatches,
				`viajes cuyo histórico difiere de PRICEADDITIONAL (de ${pairs.length} comparados; cierre más reciente ${newest})`
			).toEqual([]);
		}
	);
});
