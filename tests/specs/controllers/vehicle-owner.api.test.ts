// tests/specs/controllers/vehicle-owner.api.test.ts
// VehicleOwnerController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (VehicleOwnerController) + openapi.yaml.
// Todas carrier-scoped: carrierUserId = cfg.carrierId.
// {id}/{ownerId} se derivan del listado vehicleOwners/paginated (VehicleOwnerResponseDTO.id); test.skip si vacío.
// {id} de vehicle/{id}/drivers = vehicleId, derivado de carriers/{carrierId}/vehicles/paginated; test.skip si vacío.
// Shapes: SelectComponentResponseDTO (key/value), VehicleOwnerResponseDTO (id), VehicleDriversResponseDTO (driverId),
//   Page inline (content/totalElements). Endpoints mutantes (POST create/report, PUT update/addNote) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

// Paginados: el backend hace Optional.get() sobre page/size/column/sort → 500 si van vacíos. Siempre enviarlos.
const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };

// Deriva el id del primer vehicle owner del carrier de runtime.
async function firstOwnerId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carriers/${carrierId}/vehicleOwners/paginated`, { params: PAGE_PARAMS });
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as { content?: Array<{ id?: number }> };
	return body.content?.[0]?.id;
}

// Deriva un vehicleId real desde los vehículos del carrier de runtime.
async function firstVehicleId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carriers/${carrierId}/vehicles/paginated`, { params: PAGE_PARAMS });
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as { content?: Array<{ vehicleId?: number }> };
	return body.content?.[0]?.vehicleId;
}

test.describe('VehicleOwnerController', () => {
	// ── carrier-scoped limpio → assert fuerte ────────────────────────────────
	// BUG backend: getWithoutOwner responde 500 Internal Server Error (confirmado prod carrier 1040, con y sin params).
	// La variante /paginated sí responde 200 → inconsistencia backend. Ver BACKLOG hallazgo backend.
	test.fixme('Validar GET carriers/{carrierUserId}/vehicleOwners', async ({ magiisApi, cfg }) => {
		// getWithoutOwner → array<SelectComponentResponseDTO> (key/value required).
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/vehicleOwners`);
		const list = await expectArray<{ key?: string; value?: string }>(r);
		if (list.length > 0) {
			expect(list[0]).toHaveProperty('key');
			expect(list[0]).toHaveProperty('value');
		}
	});

	test('Validar GET carriers/{carrierUserId}/vehicleOwners/paginated', async ({ magiisApi, cfg }) => {
		// getVehicleOwnersPaginated → Page<VehicleOwnerResponseDTO> (content/totalElements).
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/vehicleOwners/paginated`, { params: PAGE_PARAMS });
		const page = await expectPageShape<{ id?: number }>(r);
		if (page.content.length > 0) expect(page.content[0]).toHaveProperty('id');
	});

	// ── carrier-scoped con query find required → tolerante ────────────────────
	test('Validar GET carriers/{carrierUserId}/vehicleOwners/unlinkedToDriver', async ({ magiisApi, cfg }) => {
		// getOwnersUnlinkedToDriver → array<VehicleOwnerResponseDTO>. `find` es required (string) → valor neutro ''.
		// Carrier-scoped y no data-dependiente → con el required satisfecho debe dar 200 → assert firme.
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/vehicleOwners/unlinkedToDriver`, {
			params: { find: '' }
		});
		const list = await expectArray<{ id?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	// ── ownerId derivado → VehicleOwnerResponseDTO ────────────────────────────
	test('Validar GET carriers/{carrierUserId}/vehicleOwners/{id} (getById)', async ({ magiisApi, cfg }) => {
		const ownerId = await firstOwnerId(magiisApi, cfg.carrierId);
		test.skip(ownerId === undefined, 'Sin vehicle owners en el carrier para derivar {id}');
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/vehicleOwners/${ownerId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	test('Validar GET carriers/{carrierUserId}/vehicleOwners/basicInfo/{id} (getOwnerBasicInfo)', async ({
		magiisApi,
		cfg
	}) => {
		const ownerId = await firstOwnerId(magiisApi, cfg.carrierId);
		test.skip(ownerId === undefined, 'Sin vehicle owners en el carrier para derivar {id}');
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/vehicleOwners/basicInfo/${ownerId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	test('Validar GET carriers/{carrierUserId}/vehicleOwners/{ownerId}/checkingAccountMovements/paginated', async ({
		magiisApi,
		cfg
	}) => {
		const ownerId = await firstOwnerId(magiisApi, cfg.carrierId);
		test.skip(ownerId === undefined, 'Sin vehicle owners en el carrier para derivar {ownerId}');
		// getCheckingAccountMovements → 200 sin schema de body en openapi → shape mínima (truthy) si 200.
		const r = await magiisApi.getJson(
			`carriers/${cfg.carrierId}/vehicleOwners/${ownerId}/checkingAccountMovements/paginated`,
			{ params: PAGE_PARAMS }
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	// ── vehicleId derivado → VehicleDriversResponseDTO ────────────────────────
	test('Validar GET carriers/{carrierUserId}/vehicleOwners/vehicle/{id}/drivers (getDriversVehicle)', async ({
		magiisApi,
		cfg
	}) => {
		const vehicleId = await firstVehicleId(magiisApi, cfg.carrierId);
		test.skip(vehicleId === undefined, 'Sin vehículos en el carrier para derivar {id}');
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/vehicleOwners/vehicle/${vehicleId}/drivers`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ driverId?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('driverId');
		}
	});
});
