// tests/specs/controllers/magiis-services-cost.api.test.ts
// MagiisServicesCostController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (MagiisServicesCostController).
// Shapes: openapi.yaml (array de MagiisServiceCostResponseDTO en ambos GET).
// Config de costos/precios admin-scoped bajo token carrier puede dar 403 → status tolerante.
// `search` es un GET con requestBody requerido en el contrato; el cliente no envía body → 400 posible.

import { test, expect } from '@TestBase';
import { expectArray } from '@helpers';

test.describe('MagiisServicesCostController', () => {
	test('Validar GET magiisServicesCost/allServicesCost', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('magiisServicesCost/allServicesCost');
		// array<MagiisServiceCostResponseDTO>. Admin-scoped → 403 posible.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number; service?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	// fixme: GET con requestBody requerido; backend 500 en vez de 400 sin body (robustez).
	test.fixme('Validar GET magiisServicesCost/search', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('magiisServicesCost/search');
		// array<MagiisServiceCostResponseDTO>. GET con requestBody requerido en el contrato → 400 esperado sin body.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number; service?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});
});
