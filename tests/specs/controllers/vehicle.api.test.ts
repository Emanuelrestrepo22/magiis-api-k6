// tests/specs/controllers/vehicle.api.test.ts
// VehicleController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (VehicleController).
// Shapes contra openapi.yaml (VehicleResponseDTO, TransportTypeResponseDTO, VehicleICardResponseDTO
// y el array de enums de tipos de vehículo).
// {vehicleId} se deriva del primer item de carriers/{carrierId}/vehicles/paginated (campo vehicleId).
// {carrierId} = cfg.carrierId. Endpoints mutantes (POST createVehicle, PUT update/surrender) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

// Deriva un vehicleId real desde los vehículos del carrier de runtime.
async function firstVehicleId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carriers/${carrierId}/vehicles/paginated`, {
		params: { page: 0, size: 10 }
	});
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as { content?: Array<{ vehicleId?: number }> };
	return body.content?.[0]?.vehicleId;
}

test.describe('VehicleController', () => {
	// ── Param-free → assert fuerte 2xx + array de enums de tipo ────────────────
	test('Validar GET vehicles/types', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('vehicles/types');
		// Array<string enum STANDARD|PREMIUM|SPECIAL>.
		const list = await expectArray<string>(r);
		if (list.length > 0) expect(typeof list[0]).toBe('string');
	});

	// ── carrierId = cfg.carrierId → array TransportTypeResponseDTO ─────────────
	test('Validar GET vehicles/:carrierId/types', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`vehicles/${cfg.carrierId}/types`);
		// TransportTypeResponseDTO — id y name son required en el schema.
		const list = await expectArray<{ id?: number; name?: string }>(r);
		if (list.length > 0) {
			expect(list[0]).toHaveProperty('id');
			expect(list[0]).toHaveProperty('name');
		}
	});

	// ── vehicleId derivado → VehicleResponseDTO ────────────────────────────────
	test('Validar GET vehicles/:vehicleId (getById)', async ({ magiisApi, cfg }) => {
		const vehicleId = await firstVehicleId(magiisApi, cfg.carrierId);
		test.skip(vehicleId === undefined, 'Sin vehículos en el carrier para derivar {vehicleId}');
		const r = await magiisApi.getJson(`vehicles/${vehicleId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'vehicleId');
	});

	// ── vehicleId derivado → VehicleICardResponseDTO ───────────────────────────
	test('Validar GET vehicles/:vehicleId/iCard (getIdentificationCardById)', async ({ magiisApi, cfg }) => {
		const vehicleId = await firstVehicleId(magiisApi, cfg.carrierId);
		test.skip(vehicleId === undefined, 'Sin vehículos en el carrier para derivar {vehicleId}');
		const r = await magiisApi.getJson(`vehicles/${vehicleId}/iCard`);
		// VehicleICardResponseDTO — schema sin campos required → shape mínima cuando 200.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});
});
