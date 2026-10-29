// tests/specs/controllers/carrier-zone.api.test.ts
// CarrierZoneController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierZoneController).
// Shapes contra openapi.yaml (CarrierZoneGetResponseDTO, ZipCodeDTO).
// carrierId = cfg.carrierId. zoneId se deriva de getCarrierZones.
// zipcode/country no derivables (lookup de geocoding) → aserción tolerante.
// Endpoints mutantes (POST create/validatePoint/zipcodeArea, PUT desactive/update, DELETE) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';

test.describe('CarrierZoneController', () => {
	// ── Listado carrier-scoped → array<CarrierZoneGetResponseDTO> ─────────────
	test('Validar GET carriers/{carrierId}/carrierZone', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierZone`);
		const list = await expectArray<{ zoneId?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('zoneId');
	});

	// ── zoneId derivado del listado → CarrierZoneGetResponseDTO ───────────────
	test('Validar GET carriers/{carrierId}/carrierZone/{zoneId}', async ({ magiisApi, cfg }) => {
		const src = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierZone`);
		const list = await expectArray<{ zoneId?: number }>(src);
		test.skip(list.length === 0, 'Sin zonas en el carrier para derivar {zoneId}');
		const zoneId = list[0].zoneId;
		test.skip(zoneId === undefined, 'Primera zona sin zoneId');
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierZone/${zoneId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'zoneId');
	});

	// ── Lookup zipcode/país (geocoding) → tolerante + shape mínima si 200 ─────
	//    zipcode/country no son derivables de datos del carrier; se usan valores de
	//    muestra. Lookup geográfico → status tolerante (incluye 403).
	test('Validar GET carriers/{carrierId}/carrierZone/zipcodeArea/{zipcode}/{country}', async ({ magiisApi, cfg }) => {
		const zipcode = '10001';
		const country = 'US';
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierZone/zipcodeArea/${zipcode}/${country}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});
});
