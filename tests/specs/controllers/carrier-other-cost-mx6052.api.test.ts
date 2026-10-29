// tests/specs/controllers/carrier-other-cost-mx6052.api.test.ts
//
// MX-6052 — "Otros Costos en edición de viaje no se muestran" (capa API).
// El select del modal "Agregar Otro Costo" se alimenta de POST /carriers/{carrierId}/otherCosts/search
// (`searchCarrierOtherCostSearch`). El bug era el select VACÍO (race condition: las opciones se armaban
// antes de la respuesta). Esta suite valida el CONTRATO/data-source: la búsqueda devuelve los conceptos
// del carrier (no vacío) con la forma esperada, y el filtro apply=CARRIER lista sólo aplicables al carrier.
//
// Trazabilidad: ticket MX-6052 · ATP MX-6102 · ATR MX-6114 · Xray Test MX-6134.
// Complementa la capa UI (E2E en carrier-v2-e2e: modal + selección + Guardar) — capas distintas, sin duplicar.

import { test, expect } from '@TestBase';

test.describe('[MX-6052] Otros Costos — data source del select (otherCosts/search)', () => {
	test(
		'[TS-MX6052-API-01] search devuelve los conceptos del carrier (select NO vacío) con la forma esperada',
		{
			annotation: [
				{ type: 'tms', description: 'MX-6134' },
				{ type: 'issue', description: 'MX-6052' }
			]
		},
		async ({ magiisApi, cfg }) => {
			const r = await magiisApi.postJson(`carriers/${cfg.carrierId}/otherCosts/search`, {});
			expect(r.status(), 'otherCosts/search debe responder 200').toBe(200);

			const body = await r.json();
			const items = Array.isArray(body) ? body : (body?.content ?? []);
			// AC1 (fix del bug): el listado NO debe venir vacío.
			expect(items.length, 'el select de Otros Costos NO debe venir vacío (race condition MX-6052)').toBeGreaterThan(0);

			// Shape de concepto (grounded UAT): id, concept, conceptType, conceptValue, apply[].
			const item = items[0];
			expect(item).toEqual(
				expect.objectContaining({
					id: expect.anything(),
					concept: expect.anything(),
					conceptType: expect.anything()
				})
			);
			// conceptType válido (QTY/FIX/VAR/PCT — determina el comportamiento de campos en el modal, AC2).
			expect(['QTY', 'FIX', 'VAR', 'PCT']).toContain(String(item.conceptType));
		}
	);

	test(
		'[TS-MX6052-API-02] filtro apply=CARRIER: sólo conceptos aplicables al carrier',
		{
			annotation: [
				{ type: 'tms', description: 'MX-6134' },
				{ type: 'issue', description: 'MX-6052' }
			]
		},
		async ({ magiisApi, cfg }) => {
			const r = await magiisApi.postJson(`carriers/${cfg.carrierId}/otherCosts/search`, { apply: 'CARRIER' });
			expect(r.status()).toBe(200);

			const body = await r.json();
			const items = Array.isArray(body) ? body : (body?.content ?? []);
			expect(items.length, 'debe haber conceptos aplicables al carrier').toBeGreaterThan(0);
			// Regla #4 del checklist: cada concepto listado incluye CARRIER en `apply`.
			for (const it of items) {
				const apply = Array.isArray(it.apply) ? it.apply : [it.apply];
				expect(apply, `concepto ${it.id} debe aplicar a CARRIER`).toContain('CARRIER');
			}
		}
	);
});
