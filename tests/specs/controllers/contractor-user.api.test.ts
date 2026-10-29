// tests/specs/controllers/contractor-user.api.test.ts
// ContractorUserController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (ContractorUserController).
// Shapes: openapi.yaml (AbleToUseContractorUserResponseDTO req id/companyName; UserResponseDTO req userId/firstName/lastName;
// getUsersPaginated = objeto content+totalElements).
// {id}/{magiisNumber} candidatos = contractorId/contractorMagiisNumber de carrier/{carrierId}/contractors/paginated.
// {userId} derivado del primer usuario del contractor. Datos contractor-scoped desde token carrier →
// aserciones tolerantes (incl. 403; el set descarta 5xx). Mutantes (POST/PUT) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectPageShape, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

const PAGE_PARAMS = { page: 0, size: 10 };
const TOLERANT = [200, 400, 403, 404];

type ContractorRef = { id?: number; magiisNumber?: string };

// Primera relación contractor del carrier de runtime: id (contractorId) + magiisNumber.
async function firstContractor(magiisApi: MagiisApiClient, carrierId: number): Promise<ContractorRef> {
	const src = await magiisApi.getJson(`carrier/${carrierId}/contractors/paginated`, { params: PAGE_PARAMS });
	if (src.status() !== 200) return {};
	const body = (await src.json()) as {
		content?: Array<{ contractorId?: number; contractorMagiisNumber?: string }>;
	};
	return { id: body.content?.[0]?.contractorId, magiisNumber: body.content?.[0]?.contractorMagiisNumber };
}

// Primer userId de los usuarios del contractor.
async function firstUserId(magiisApi: MagiisApiClient, contractorId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`contractors/${contractorId}/users/paginated`, { params: PAGE_PARAMS });
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as { content?: Array<{ userId?: number }> };
	return body.content?.[0]?.userId;
}

test.describe('ContractorUserController', () => {
	// ── id (contractorId) derivado → AbleToUseContractorUserResponseDTO (id req) ──
	test('Validar GET contractors/{id}', async ({ magiisApi, cfg }) => {
		const { id } = await firstContractor(magiisApi, cfg.carrierId);
		test.skip(id === undefined, 'Sin relaciones contractor en el carrier para derivar {id}');
		const r = await magiisApi.getJson(`contractors/${id}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	// ── getByUser: id candidato = contractorId → AbleToUseContractorUserResponseDTO ──
	test('Validar GET contractors/user/{id}', async ({ magiisApi, cfg }) => {
		const { id } = await firstContractor(magiisApi, cfg.carrierId);
		test.skip(id === undefined, 'Sin relaciones contractor en el carrier para derivar {id}');
		const r = await magiisApi.getJson(`contractors/user/${id}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	// ── magiisNumber derivado → AbleToUseContractorUserResponseDTO ──
	test('Validar GET contractors/magiis/{magiisNumber}', async ({ magiisApi, cfg }) => {
		const { magiisNumber } = await firstContractor(magiisApi, cfg.carrierId);
		test.skip(magiisNumber === undefined, 'Sin magiisNumber en las relaciones del carrier para derivar {magiisNumber}');
		const r = await magiisApi.getJson(`contractors/magiis/${encodeURIComponent(magiisNumber as string)}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	// ── users paginados del contractor → Page<UserResponseDTO> (userId req) ──
	test('Validar GET contractors/{id}/users/paginated', async ({ magiisApi, cfg }) => {
		const { id } = await firstContractor(magiisApi, cfg.carrierId);
		test.skip(id === undefined, 'Sin relaciones contractor en el carrier para derivar {id}');
		const r = await magiisApi.getJson(`contractors/${id}/users/paginated`, { params: PAGE_PARAMS });
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const page = await expectPageShape<{ userId?: number }>(r);
			if (page.content.length > 0) expect(page.content[0]).toHaveProperty('userId');
		}
	});

	// ── usuario puntual del contractor: id + userId derivados → UserResponseDTO (userId req) ──
	test('Validar GET contractors/{id}/users/{userId}', async ({ magiisApi, cfg }) => {
		const { id } = await firstContractor(magiisApi, cfg.carrierId);
		test.skip(id === undefined, 'Sin relaciones contractor en el carrier para derivar {id}');
		const userId = await firstUserId(magiisApi, id as number);
		test.skip(userId === undefined, 'Sin usuarios del contractor para derivar {userId}');
		const r = await magiisApi.getJson(`contractors/${id}/users/${userId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'userId');
	});
});
