// tests/specs/controllers/api-integration.api.test.ts
// ApiIntegrationController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (ApiIntegrationController).
// Shapes: openapi.yaml (ApiApplicationSummaryDTO, ApiIntegrationResponseDTO, ApiServicesDTO,
//   ApiRolesDTO, ApiAplicationLogResponseDTO, ContractorCurrentRelationsDTO).
// Controller de gestión de aplicaciones de integración (admin/contractor-scoped) → status TOLERANTE
//   (incluye 403). carrierId = cfg.carrierId. applicationId/serviceId/contractorAccountId se derivan
//   de api/carrier/{carrierId}/paginated; accountId/userType de api/applications/paginated.
// Endpoints POST/PUT/DELETE (create, update, updateStatus, reset, delete) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty, readJsonSafe } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

const TOLERANT = [200, 400, 403, 404];

type CarrierApp = { id?: number; serviceId?: number; contractorAccountId?: number };

// Deriva la primera aplicación del carrier de runtime (ApiIntegrationResponseDTO).
async function firstCarrierApp(magiisApi: MagiisApiClient, carrierId: number): Promise<CarrierApp | undefined> {
	const src = await magiisApi.getJson(`api/carrier/${carrierId}/paginated`, {
		params: { magiisApi: false, page: 1, size: 10, column: 'id', sort: 'ASC' }
	});
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as { content?: CarrierApp[] };
	return body.content?.[0];
}

// Deriva accountId + userType desde el resumen global de aplicaciones (ApiApplicationSummaryDTO).
async function firstAppSummary(
	magiisApi: MagiisApiClient
): Promise<{ accountId?: number; userType?: string } | undefined> {
	const src = await magiisApi.getJson('api/applications/paginated', {
		params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
	});
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as { content?: Array<{ accountId?: number; userType?: string }> };
	return body.content?.[0];
}

test.describe('ApiIntegrationController', () => {
	// ── Resumen global de aplicaciones (admin-scoped) → inline Page<ApiApplicationSummaryDTO> ──────
	// BUG backend: SQLGrammarException "could not extract ResultSet" por column inválida en JpaSort.unsafe
	// + countryId.get() unguarded (ApiIntegrationController L340-355); 500 aún con page:1/size/column/sort/find.
	test.fixme('Validar GET api/applications/paginated', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('api/applications/paginated', {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const page = await expectPageShape<{ accountId?: number }>(r);
			if (page.content.length > 0) expect(page.content[0]).toHaveProperty('accountId');
		}
	});

	// ── carrierId = cfg.carrierId (query magiisApi requerido) → inline Page<ApiIntegrationResponseDTO> ─
	test('Validar GET api/carrier/{carrierId}/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`api/carrier/${cfg.carrierId}/paginated`, {
			params: { magiisApi: false, page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const page = await expectPageShape<{ id?: number }>(r);
			if (page.content.length > 0) expect(page.content[0]).toHaveProperty('id');
		}
	});

	// ── accountId + userType derivados del resumen → inline Page<ApiIntegrationResponseDTO> ─────────
	test('Validar GET api/applications/{accountId}/{userType}/paginated', async ({ magiisApi }) => {
		const summary = await firstAppSummary(magiisApi);
		test.skip(
			summary?.accountId === undefined || summary?.userType === undefined,
			'Sin resumen de aplicaciones para derivar {accountId}/{userType}'
		);
		const r = await magiisApi.getJson(`api/applications/${summary!.accountId}/${summary!.userType}/paginated`, {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	// ── contractorId derivado (contractorAccountId de la app del carrier) → ContractorCurrentRelationsDTO ─
	test('Validar GET api/contractor/{contractorId}/carriers', async ({ magiisApi, cfg }) => {
		const app = await firstCarrierApp(magiisApi, cfg.carrierId);
		const contractorId = app?.contractorAccountId;
		test.skip(
			contractorId === undefined || contractorId === null,
			'Sin contractorAccountId para derivar {contractorId}'
		);
		const r = await magiisApi.getJson(`api/contractor/${contractorId}/carriers`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	// ── contractorId derivado → inline Page<ApiIntegrationResponseDTO> ──────────────────────────────
	test('Validar GET api/contractor/{contractorId}/paginated', async ({ magiisApi, cfg }) => {
		const app = await firstCarrierApp(magiisApi, cfg.carrierId);
		const contractorId = app?.contractorAccountId;
		test.skip(
			contractorId === undefined || contractorId === null,
			'Sin contractorAccountId para derivar {contractorId}'
		);
		const r = await magiisApi.getJson(`api/contractor/${contractorId}/paginated`, {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	// ── contractorId derivado → array<ApiRolesDTO> (item id) ────────────────────────────────────────
	test('Validar GET api/roles/{contractorId}', async ({ magiisApi, cfg }) => {
		const app = await firstCarrierApp(magiisApi, cfg.carrierId);
		const contractorId = app?.contractorAccountId;
		test.skip(
			contractorId === undefined || contractorId === null,
			'Sin contractorAccountId para derivar {contractorId}'
		);
		const r = await magiisApi.getJson(`api/roles/${contractorId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	// ── applicationId derivado (id de la app del carrier) → array<ApiServicesDTO> (item id) ─────────
	test('Validar GET api/log/services/{applicationId}', async ({ magiisApi, cfg }) => {
		const app = await firstCarrierApp(magiisApi, cfg.carrierId);
		test.skip(app?.id === undefined, 'Sin aplicaciones del carrier para derivar {applicationId}');
		const r = await magiisApi.getJson(`api/log/services/${app!.id}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	// ── applicationId derivado → inline Page<ApiAplicationLogResponseDTO> ───────────────────────────
	test('Validar GET api/log/{applicationId}/paginated', async ({ magiisApi, cfg }) => {
		const app = await firstCarrierApp(magiisApi, cfg.carrierId);
		test.skip(app?.id === undefined, 'Sin aplicaciones del carrier para derivar {applicationId}');
		const r = await magiisApi.getJson(`api/log/${app!.id}/paginated`, {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	// ── applicationId + serviceId derivados → inline Page<ApiAplicationLogResponseDTO> ──────────────
	test('Validar GET api/log/{applicationId}/{serviceId}/paginated', async ({ magiisApi, cfg }) => {
		const app = await firstCarrierApp(magiisApi, cfg.carrierId);
		test.skip(
			app?.id === undefined || app?.serviceId === undefined,
			'Sin aplicaciones del carrier con serviceId para derivar {applicationId}/{serviceId}'
		);
		const r = await magiisApi.getJson(`api/log/${app!.id}/${app!.serviceId}/paginated`, {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	// ── id derivado → ApiIntegrationResponseDTO (prop id) ───────────────────────────────────────────
	test('Validar GET api/{id}', async ({ magiisApi, cfg }) => {
		const app = await firstCarrierApp(magiisApi, cfg.carrierId);
		test.skip(app?.id === undefined, 'Sin aplicaciones del carrier para derivar {id}');
		const r = await magiisApi.getJson(`api/${app!.id}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	// ── username placeholder (no se deriva) → boolean; solo verifica que no haya 5xx ───────────────
	test('Validar GET api/user/validate/{username}', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('api/user/validate/qa-e2e-nonexistent');
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			// Usuario inexistente responde 200 con cuerpo vacío ("Unexpected end of JSON input") → parseo tolerante.
			const body = await readJsonSafe<boolean>(r);
			if (body !== null) expect(typeof body).toBe('boolean');
		}
	});
});
