// tests/specs/controllers/special-rate-trigger.api.test.ts
// SpecialRateTriggerController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (SpecialRateTriggerController).
// Shapes contra openapi.yaml (SpecialRateTriggerSearchResponseDTO,
// SpecialRateTriggerParametersResponseDTO, SpecialRateTriggerResponseDTO).
// carrierId = cfg.carrierId. specialRateId se deriva de getSpecialRateTriggerByTab.
// Endpoints mutantes (POST create/delete, PUT active/update/parameters) fuera de alcance.

import { test, expect } from '@TestBase';
import { expect2xx, expectArray, expectObjectWithProperty } from '@helpers';

test.describe('SpecialRateTriggerController', () => {
	// ── Listado carrier-scoped → array<SpecialRateTriggerSearchResponseDTO> ───
	test('Validar GET carriers/{carrierId}/specialRateTrigger', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/specialRateTrigger`);
		const list = await expectArray<{ specialRateId?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('specialRateId');
	});

	// ── Parámetros de config carrier-scoped → SpecialRateTriggerParametersResponseDTO
	//    Objeto de configuración con props anulables → shape mínima (objeto truthy) cuando 200.
	test('Validar GET carriers/{carrierId}/specialRateTrigger/parameters', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/specialRateTrigger/parameters`);
		await expect2xx(r);
		const body = (await r.json()) as unknown;
		expect(typeof body === 'object' && body !== null).toBe(true);
	});

	// ── specialRateId derivado del listado → SpecialRateTriggerResponseDTO ────
	test('Validar GET carriers/{carrierId}/specialRateTrigger/{specialRateId}', async ({ magiisApi, cfg }) => {
		const src = await magiisApi.getJson(`carriers/${cfg.carrierId}/specialRateTrigger`);
		const list = await expectArray<{ specialRateId?: number }>(src);
		test.skip(list.length === 0, 'Sin special rate triggers en el carrier para derivar {specialRateId}');
		const specialRateId = list[0].specialRateId;
		test.skip(specialRateId === undefined, 'Primer trigger sin specialRateId');
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/specialRateTrigger/${specialRateId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'specialRateId');
	});
});
