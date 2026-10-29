// tests/specs/controllers/owner-portal.api.test.ts
// OwnerPortalController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (OwnerPortalController).
// Shapes: openapi.yaml (VehicleOwnerResponseDTO, DriverSmallestResponseDTO, VehicleDashBoardResponseDTO).
// {userId}/{ownerUserId} NO están en cfg (son ids de owner/usuario, no de carrier) y no hay listado in-scope
// para derivarlos → se sondea con cfg.carrierId como valor de runtime y se tolera [200,400,403,404]
// (el set ya descarta 5xx). Endpoint mutante (PUT reSendEmailConfirmation) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';

test.describe('OwnerPortalController', () => {
	// ── getByUserId → VehicleOwnerResponseDTO (id required) ──
	test('Validar GET vehicleOwners/user/{userId}', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`vehicleOwners/user/${cfg.carrierId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	// ── getDrivers → array<DriverSmallestResponseDTO> (item: driverUserId required) ──
	test('Validar GET vehicleOwners/{ownerUserId}/drivers', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`vehicleOwners/${cfg.carrierId}/drivers`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ driverUserId?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('driverUserId');
		}
	});

	// ── getVehicles → array<VehicleDashBoardResponseDTO> (item: transportTypeName required) ──
	test('Validar GET vehicleOwners/{ownerUserId}/vehicles', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`vehicleOwners/${cfg.carrierId}/vehicles`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ transportTypeName?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('transportTypeName');
		}
	});
});
