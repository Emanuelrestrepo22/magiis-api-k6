// tests/specs/controllers/contractor-employee.api.test.ts
// ContractorEmployeeController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (ContractorEmployeeController).
// Shapes: openapi.yaml (ContractorEmployeeResponseDTO req id/passengerId/userType;
// ContractorEmployeeServiceTypeUsageResponseDTO req serviceTypeid; paginados = objeto content+totalElements).
// {contractorUserId} candidato = contractorId de carrier/{carrierId}/contractors/paginated (CarrierContractorRelationDTO).
// {contractorEmployeeId}/{areaId} derivados del primer empleado de ese contractor. {passengerId} = passengerUserId
// del primer cliente del carrier. {carrierId} = cfg.carrierId. Datos contractor-scoped desde token carrier →
// aserciones tolerantes (incl. 403; el set descarta 5xx). Mutantes (POST/PUT/DELETE) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty, readJsonSafe } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };
// byArea/{areaId}/paginated solo declara page & size en openapi.yaml (sin column/sort) → variante mínima.
const PAGE_PARAMS_BY_AREA = { page: 1, size: 10 };
const TOLERANT = [200, 400, 403, 404];

// contractorUserId candidato: contractorId de la primera relación del carrier de runtime.
async function firstContractorUserId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	// find:'' obligatorio: contractors/paginated hace Optional.get() unguarded sobre el filtro 'find'
	// (sin él → 500 "No value present"; bug backend confirmado en prod).
	const src = await magiisApi.getJson(`carrier/${carrierId}/contractors/paginated`, {
		params: { ...PAGE_PARAMS, find: '' }
	});
	if (src.status() !== 200) return undefined;
	const body = await readJsonSafe<{ content?: Array<{ contractorId?: number }> }>(src);
	return body?.content?.[0]?.contractorId;
}

type EmployeeCtx = { employeeId?: number; areaId?: number };

// Deriva el primer empleado del contractor (id + areaId) para los endpoints por empleado.
async function firstEmployee(magiisApi: MagiisApiClient, carrierId: number): Promise<EmployeeCtx> {
	const contractorUserId = await firstContractorUserId(magiisApi, carrierId);
	if (contractorUserId === undefined) return {};
	const src = await magiisApi.getJson(`contractorEmployees/${contractorUserId}/paginated`, { params: PAGE_PARAMS });
	if (src.status() !== 200) return {};
	const body = await readJsonSafe<{ content?: Array<{ id?: number; areaId?: number }> }>(src);
	return { employeeId: body?.content?.[0]?.id, areaId: body?.content?.[0]?.areaId };
}

// passengerId candidato: passengerUserId del primer cliente del carrier.
async function firstPassengerId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carriers/${carrierId}/clients`);
	if (src.status() !== 200) return undefined;
	const list = await readJsonSafe<Array<{ passengerUserId?: number }>>(src);
	return Array.isArray(list) ? list[0]?.passengerUserId : undefined;
}

test.describe('ContractorEmployeeController', () => {
	// ── contractorUserId derivado → Page<ContractorEmployeeResponseDTO> (id req) ──
	test('Validar GET contractorEmployees/{contractorUserId}/paginated', async ({ magiisApi, cfg }) => {
		const contractorUserId = await firstContractorUserId(magiisApi, cfg.carrierId);
		test.skip(
			contractorUserId === undefined,
			'Sin relaciones contractor en el carrier para derivar {contractorUserId}'
		);
		const r = await magiisApi.getJson(`contractorEmployees/${contractorUserId}/paginated`, { params: PAGE_PARAMS });
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const page = await expectPageShape<{ id?: number }>(r);
			if (page.content.length > 0) expect(page.content[0]).toHaveProperty('id');
		}
	});

	// ── areaId derivado del empleado → Page<ContractorEmployeeResponseDTO> ──
	test('Validar GET contractorEmployees/byArea/{areaId}/paginated', async ({ magiisApi, cfg }) => {
		const { areaId } = await firstEmployee(magiisApi, cfg.carrierId);
		test.skip(areaId === undefined, 'Sin empleados con areaId para derivar {areaId}');
		const r = await magiisApi.getJson(`contractorEmployees/byArea/${areaId}/paginated`, {
			params: PAGE_PARAMS_BY_AREA
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	// ── passengerId derivado → Page<ContractorEmployeeResponseDTO> ──
	test('Validar GET contractorEmployees/byPassenger/{passengerId}/paginated', async ({ magiisApi, cfg }) => {
		const passengerId = await firstPassengerId(magiisApi, cfg.carrierId);
		test.skip(passengerId === undefined, 'Sin clientes en el carrier para derivar {passengerId}');
		const r = await magiisApi.getJson(`contractorEmployees/byPassenger/${passengerId}/paginated`, {
			params: PAGE_PARAMS
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			// 200 puede venir con cuerpo vacío ("Unexpected end of JSON input") → parseo tolerante.
			const page = await readJsonSafe<{ content?: unknown[]; totalElements?: number }>(r);
			if (page) {
				expect(page).toHaveProperty('content');
				expect(Array.isArray(page.content)).toBe(true);
				expect(page).toHaveProperty('totalElements');
			}
		}
	});

	// ── contractorEmployeeId derivado → ContractorEmployeeResponseDTO (id req) ──
	test('Validar GET contractorEmployees/{contractorEmployeeId}', async ({ magiisApi, cfg }) => {
		const { employeeId } = await firstEmployee(magiisApi, cfg.carrierId);
		test.skip(employeeId === undefined, 'Sin empleados del contractor para derivar {contractorEmployeeId}');
		const r = await magiisApi.getJson(`contractorEmployees/${employeeId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	// ── serviceTypeUsages del empleado → array<ContractorEmployeeServiceTypeUsageResponseDTO> (serviceTypeid req) ──
	test('Validar GET contractorEmployees/{contractorEmployeeId}/serviceTypeUsages', async ({ magiisApi, cfg }) => {
		const { employeeId } = await firstEmployee(magiisApi, cfg.carrierId);
		test.skip(employeeId === undefined, 'Sin empleados del contractor para derivar {contractorEmployeeId}');
		const r = await magiisApi.getJson(`contractorEmployees/${employeeId}/serviceTypeUsages`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ serviceTypeid?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('serviceTypeid');
		}
	});

	// ── serviceTypes sin autorización (employee + carrier cfg) → array<...ServiceTypeUsageResponseDTO> ──
	test('Validar GET contractorEmployees/{contractorEmployeeId}/serviceTypes/carrier/{carrierId}/withoutAuthorization', async ({
		magiisApi,
		cfg
	}) => {
		const { employeeId } = await firstEmployee(magiisApi, cfg.carrierId);
		test.skip(employeeId === undefined, 'Sin empleados del contractor para derivar {contractorEmployeeId}');
		const r = await magiisApi.getJson(
			`contractorEmployees/${employeeId}/serviceTypes/carrier/${cfg.carrierId}/withoutAuthorization`
		);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ serviceTypeid?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('serviceTypeid');
		}
	});
});
