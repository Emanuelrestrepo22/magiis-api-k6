// tests/specs/_mutation/carrier-other-cost.mutation.api.test.ts
// Harness de mutación segura — CarrierOtherCostController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth openapi.yaml → CarrierOtherCost):
//   POST carriers/{carrierId}/otherCosts/new     → CarrierOtherCostResponseDTO { id, concept, conceptType, conceptValue, ... }
//   POST carriers/{carrierId}/otherCosts/search  → CarrierOtherCostResponseDTO[]  (body CarrierOtherCostSearchRequestDTO: name/type/apply/serviceTypeId; el FE de prod manda name+type+apply)
//   POST carriers/{carrierId}/otherCosts/delete  → 200 (body CarrierOtherCostRequestDTO con id)
// Body create: CarrierOtherCostRequestDTO — sin campos required en el schema; se envían solo campos existentes
// (name, type → concept/conceptType en la respuesta; conceptValue, apply, isCommisionable, maxValue). Sin enum en el schema.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';

test.describe.serial('[_mutation] CarrierOtherCostController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear otherCost → verificar (search) → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		let costId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const costName = `QA-HARNESS-${Date.now()}`;
			const costType = 'FIXED'; // conceptType persistido (CarrierOtherCostService L33); reusado en el search para que la fila creada matchee el filtro conceptType.
			// apply DEBE ser no-vacío: create hace String.join(";", apply) → con [] queda "" → Oracle lo
			// guarda como NULL → el search hace coc.getApply().split(";") SIN null-check (CarrierOtherCostService:89)
			// → NPE 500 al serializar la fila. Bug backend BE-11; el FE real siempre manda apply no-vacío.
			const createRes = await magiisApi.postJson(`carriers/${cfg.carrierId}/otherCosts/new`, {
				name: costName,
				type: costType,
				conceptValue: 10,
				apply: ['ALL'],
				isCommisionable: false,
				maxValue: 0
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as { id?: number; concept?: string };
			costId = created.id ?? null;
			expect(costId, 'addCarrierOtherCost debe devolver id').not.toBeNull();

			// ── verify (search) ─────────────────────────────────────────────────
			// El search NO acepta solo {name}: el FE de prod (other-costs.service.ts searchOtherCosts
			// + searchOtherCosts.command.ts) SIEMPRE manda name+type+apply; enviar solo {name} deja
			// type/apply ausentes (→ null) y devolvió non-2xx en UAT. Se replica la forma del
			// CarrierOtherCostSearchRequestDTO (name/type/apply) con type = costType para que la query
			// (CarrierOtherCostRepository L26-28: conceptType = :type) siga matcheando la fila creada;
			// apply=null mantiene ese filtro abierto (:apply is null).
			const searchRes = await magiisApi.postJson(`carriers/${cfg.carrierId}/otherCosts/search`, {
				name: costName,
				type: costType,
				apply: null
			});
			await expect2xx(searchRes);
			const results = (await searchRes.json()) as Array<{ id?: number; concept?: string }>;
			expect(Array.isArray(results), 'search debe devolver un array').toBe(true);
			const found = results.find((c) => c.id === costId || c.concept === costName);
			expect(found, 'el otherCost creado debe aparecer en el search (por id/concept)').toBeTruthy();
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (costId !== null) {
				const del = await magiisApi.postJson(`carriers/${cfg.carrierId}/otherCosts/delete`, { id: costId });
				expect([200, 204, 404], 'cleanup POST delete tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
