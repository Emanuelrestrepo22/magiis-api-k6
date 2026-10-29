// tests/specs/controllers/magiis-access.api.test.ts
// MagiisAccessController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (MagiisAccessController).
// Shapes: openapi.yaml (GetCarrierProfileDTO, GetContractorProfileDTO, MagiisAccess, MagiisAccessResponseDTO).
// Controller de administración de accesos/perfiles → bajo rol carrier puede responder 403 → aserciones tolerantes.
// {id} de carrierprofile se deriva del listado carrierprofiles (test.skip si no accesible/vacío).
// carrierAccountId/contractorAccountId sin equivalente en cfg → probe con cfg.carrierId + tolerante.
// portalNumber no derivable de ningún listado → probe entero + tolerante.
// roleName derivado de cfg.role (ROLE_<ROL>). Endpoints mutantes (POST/PUT/DELETE) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';

// portalNumber no se puede derivar de un listado en este controller → valor de sondeo + tolerante.
const PORTAL_PROBE = 1;

test.describe('MagiisAccessController', () => {
	test('Validar GET magiisaccess/carrierprofiles/{carrierAccountId}', async ({ magiisApi, cfg }) => {
		// getCarrierProfiles → array<GetCarrierProfileDTO>. carrierAccountId = probe cfg.carrierId; admin-scoped → 403 posible.
		const r = await magiisApi.getJson(`magiisaccess/carrierprofiles/${cfg.carrierId}`, {
			params: { status: 'ACTIVE' }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	test('Validar GET magiisaccess/carrierprofile/{id} (id derivado de carrierprofiles)', async ({ magiisApi, cfg }) => {
		const src = await magiisApi.getJson(`magiisaccess/carrierprofiles/${cfg.carrierId}`, {
			params: { status: 'ACTIVE' }
		});
		let id: number | undefined;
		if (src.status() === 200) {
			const arr = (await src.json()) as Array<{ id?: number }>;
			if (Array.isArray(arr) && arr.length > 0) id = arr[0].id;
		}
		test.skip(id === undefined, 'Sin carrier profiles accesibles para derivar {id}');
		// getCarrierProfile → GetCarrierProfileDTO.
		const r = await magiisApi.getJson(`magiisaccess/carrierprofile/${id}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	test('Validar GET magiisaccess/contractorprofiles/{contractorAccountId}', async ({ magiisApi, cfg }) => {
		// getContractorProfiles → array<GetContractorProfileDTO>. contractorAccountId probe cfg.carrierId; admin-scoped → 403 posible.
		const r = await magiisApi.getJson(`magiisaccess/contractorprofiles/${cfg.carrierId}`, {
			params: { status: 'ACTIVE' }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	test('Validar GET magiisaccess/portal/{portalNumber}', async ({ magiisApi }) => {
		// getMagiisAccessByPortal → array<MagiisAccess>. portalNumber no derivable → probe + tolerante.
		const r = await magiisApi.getJson(`magiisaccess/portal/${PORTAL_PROBE}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	test('Validar GET magiisaccess/portal/{portalNumber}/menu', async ({ magiisApi }) => {
		// getMagiisAccessMenuByPortal → array<MagiisAccessResponseDTO>. portalNumber no derivable → probe + tolerante.
		const r = await magiisApi.getJson(`magiisaccess/portal/${PORTAL_PROBE}/menu`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	test('Validar GET magiisaccess/securityrolemagiisaccess/{roleName}', async ({ magiisApi, cfg }) => {
		// getMagiisAccessListByRoleName → array<MagiisAccess>. roleName = enum MagiisRole SIN prefijo ROLE_
		// (valores: CARRIER, DRIVER, ADMIN...). Con ROLE_ → 500 "No enum constant MagiisRole.ROLE_CARRIER".
		const roleName = `${cfg.role.toUpperCase()}`;
		const r = await magiisApi.getJson(`magiisaccess/securityrolemagiisaccess/${encodeURIComponent(roleName)}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});
});
