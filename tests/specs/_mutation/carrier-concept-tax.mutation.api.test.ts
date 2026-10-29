// tests/specs/_mutation/carrier-concept-tax.mutation.api.test.ts
// Harness de mutación segura — CarrierConceptTaxController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth backend-route-catalog.json → CarrierConceptTaxController):
//   POST carriers/{carrierId}/concept                → CarrierConceptResponseDTO { conceptId, conceptName, ... }  (addCarrierConcept)
//   GET  carriers/{carrierId}/conceptTaxes           → CarrierConceptTaxResponseDTO { concepts: [...], taxes, version }  (getConceptTaxesByCarrier)
//   POST carriers/{carrierId}/concept/{conceptId}    → 200  (deleteCarrierConcept, requestBody CarrierConceptRequestDTO required)
// Body create/delete: CarrierConceptRequestDTO — sin campos required en el schema; se envían solo campos existentes
// (name, isGlobal, isArea, isAddress, fixedValue, pickupApply, dropOffApply, stopsApply). type se omite (string sin enum, no inventar).
// Body delete: se envía { id } (campo del schema) para identificar el concepto a borrar.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';

test.describe.serial('[_mutation] CarrierConceptTaxController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear concepto → verificar en conceptTaxes → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		let conceptId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const conceptName = `QA-HARNESS-${Date.now()}`;
			const createRes = await magiisApi.postJson(`carriers/${cfg.carrierId}/concept`, {
				name: conceptName,
				isGlobal: true,
				isArea: false,
				isAddress: false,
				fixedValue: 0,
				pickupApply: false,
				dropOffApply: false,
				stopsApply: false
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as { conceptId?: number; conceptName?: string };
			conceptId = created.conceptId ?? null;
			expect(conceptId, 'addCarrierConcept debe devolver conceptId').not.toBeNull();

			// ── verify ──────────────────────────────────────────────────────────
			const getRes = await magiisApi.getJson(`carriers/${cfg.carrierId}/conceptTaxes`);
			await expect2xx(getRes);
			const body = (await getRes.json()) as { concepts?: Array<{ conceptId?: number; conceptName?: string }> };
			expect(Array.isArray(body.concepts), 'conceptTaxes debe traer array concepts').toBe(true);
			const match = (body.concepts ?? []).find((c) => c.conceptId === conceptId);
			expect(match, 'el concepto creado debe aparecer en conceptTaxes').toBeDefined();
			expect(match).toHaveProperty('conceptId');
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (conceptId !== null) {
				const del = await magiisApi.postJson(`carriers/${cfg.carrierId}/concept/${conceptId}`, { id: conceptId });
				expect([200, 204, 404], 'cleanup POST deleteCarrierConcept tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
