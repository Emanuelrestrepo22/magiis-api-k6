// tests/specs/controllers/carrier-service-types.api.test.ts
// CarrierServiceTypesController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierServiceTypesController).
// Shapes contra openapi.yaml (CarrierServiceTypeResponseDTO, ContractorEmployeeWithAreaDTO,
// array<string> de iconos).
// carrierId = cfg.carrierId. serviceTypeId se deriva de getServiceTypesByCarrier.
// contractorId se deriva del contractorAccountId de un serviceType (skip si no hay).
// Endpoints mutantes (POST create/delete/sort/update, PUT active/countsReset) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';

test.describe('CarrierServiceTypesController', () => {
	// ── Listado carrier-scoped → array<CarrierServiceTypeResponseDTO> ─────────
	test('Validar GET carriers/{carrierId}/serviceTypes', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/serviceTypes`);
		const list = await expectArray<{ id?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	// ── Iconos disponibles → array<string> ────────────────────────────────────
	test('Validar GET carriers/{carrierId}/serviceTypes/availableIcons', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/serviceTypes/availableIcons`);
		const list = await expectArray<string>(r);
		if (list.length > 0) expect(typeof list[0]).toBe('string');
	});

	// ── Service types para app pax → array<CarrierServiceTypeResponseDTO> ─────
	test('Validar GET carriers/{carrierId}/serviceTypes/forAppPax', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/serviceTypes/forAppPax`);
		const list = await expectArray<{ id?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	// ── Empleados de contractor por service type → array<ContractorEmployeeWithAreaDTO>
	test('Validar GET carriers/{carrierId}/serviceTypes/employees', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/serviceTypes/employees`);
		const list = await expectArray<{ id?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	// ── serviceTypeId derivado del listado → CarrierServiceTypeResponseDTO ────
	test('Validar GET carriers/{carrierId}/serviceTypes/{serviceTypeId}', async ({ magiisApi, cfg }) => {
		const src = await magiisApi.getJson(`carriers/${cfg.carrierId}/serviceTypes`);
		const list = await expectArray<{ id?: number }>(src);
		test.skip(list.length === 0, 'Sin service types en el carrier para derivar {serviceTypeId}');
		const serviceTypeId = list[0].id;
		test.skip(serviceTypeId === undefined, 'Primer service type sin id');
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/serviceTypes/${serviceTypeId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	// ── contractorId derivado (contractorAccountId de un serviceType) ─────────
	//    El path param {contractorId} no está en cfg; se asume el contractorAccountId
	//    de un serviceType. Aserción tolerante + array si 200.
	test('Validar GET carriers/{carrierId}/serviceTypes/contractor/{contractorId}/employeesWithoutGrant', async ({
		magiisApi,
		cfg
	}) => {
		const src = await magiisApi.getJson(`carriers/${cfg.carrierId}/serviceTypes`);
		const list = await expectArray<{ contractorAccountId?: number }>(src);
		const contractorId = list.find((s) => s.contractorAccountId !== undefined)?.contractorAccountId;
		test.skip(contractorId === undefined, 'Sin serviceTypes con contractorAccountId para derivar {contractorId}');
		const r = await magiisApi.getJson(
			`carriers/${cfg.carrierId}/serviceTypes/contractor/${contractorId}/employeesWithoutGrant`
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const arr = await expectArray<{ id?: number }>(r);
			if (arr.length > 0) expect(arr[0]).toHaveProperty('id');
		}
	});
});
