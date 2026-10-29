// tests/specs/controllers/carrier-areas.api.test.ts
// CarrierAreasController — cobertura READ-ONLY (solo GET).
// Rutas exactas desde scripts/backend-route-catalog.json (§ CarrierAreasController).
// Shape contra openapi.yaml → CarrierAreaResponseDTO (id, areaType, opeType, ...).
// carrierId proviene de cfg; areaId se deriva del listado (no está en cfg).

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';

test.describe('CarrierAreasController', () => {
	test('Validar GET /carriers/:carrierId/carrierArea', async ({ magiisApi, cfg }) => {
		// Endpoint marcado como pesado en backend → timeout holgado.
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierArea`, { timeout: 10_000 });
		const list = await expectArray<{ id: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	test('Validar GET /carriers/:carrierId/carrierArea/:areaId (areaId derivado del listado)', async ({
		magiisApi,
		cfg
	}) => {
		const listRes = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierArea`, { timeout: 10_000 });
		const list = await expectArray<{ id: number }>(listRes);
		test.skip(list.length === 0, 'Sin carrierAreas en el ambiente para derivar un areaId');
		const areaId = list[0].id;
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierArea/${areaId}`);
		const one = await expectObjectWithProperty<{ id?: number }>(r, 'id');
		expect(one.id).toBe(areaId);
	});
});
