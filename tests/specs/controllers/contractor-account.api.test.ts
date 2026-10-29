// tests/specs/controllers/contractor-account.api.test.ts
// ContractorAccountController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (ContractorAccountController).
// Shapes contra openapi.yaml (ContractorAsLocalCompanyDTO, ContractorDTO,
// EmailTemplateResponseDTO, ContractorTravelsDashboardDTO).
// Todos los GET requieren {contractorAccountId}: se deriva del primer item de
// carrier/{carrierId}/contractors/paginated (campo contractorId). test.skip si no hay relaciones.
// Endpoints mutantes (PUT update/emailsTemplates/active, DELETE) quedan fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

// Deriva un contractorAccountId real desde las relaciones del carrier de runtime.
async function firstContractorAccountId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carrier/${carrierId}/contractors/paginated`, {
		params: { page: 0, size: 10 }
	});
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as { content?: Array<{ contractorId?: number }> };
	return body.content?.[0]?.contractorId;
}

test.describe('ContractorAccountController', () => {
	test('Validar GET contractor/:contractorAccountId (getPreferences)', async ({ magiisApi, cfg }) => {
		const contractorAccountId = await firstContractorAccountId(magiisApi, cfg.carrierId);
		test.skip(contractorAccountId === undefined, 'Sin relaciones contractor para derivar {contractorAccountId}');
		const r = await magiisApi.getJson(`contractor/${contractorAccountId}`);
		// ContractorAsLocalCompanyDTO — companyName es required en el schema.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'companyName');
	});

	test('Validar GET contractor/:contractorAccountId/carrier/:carrierId (getById)', async ({ magiisApi, cfg }) => {
		const contractorAccountId = await firstContractorAccountId(magiisApi, cfg.carrierId);
		test.skip(contractorAccountId === undefined, 'Sin relaciones contractor para derivar {contractorAccountId}');
		const r = await magiisApi.getJson(`contractor/${contractorAccountId}/carrier/${cfg.carrierId}`);
		// ContractorDTO — companyName es required en el schema.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'companyName');
	});

	test('Validar GET contractor/:contractorAccountId/emailsTemplates (getEmailTemplates)', async ({
		magiisApi,
		cfg
	}) => {
		const contractorAccountId = await firstContractorAccountId(magiisApi, cfg.carrierId);
		test.skip(contractorAccountId === undefined, 'Sin relaciones contractor para derivar {contractorAccountId}');
		const r = await magiisApi.getJson(`contractor/${contractorAccountId}/emailsTemplates`);
		// Array<EmailTemplateResponseDTO> — item con emailCode/id.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ emailCode?: string; id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('emailCode');
		}
	});

	test('Validar GET contractor/:contractorAccountId/travelMetrics (getTravelMetrics)', async ({ magiisApi, cfg }) => {
		const contractorAccountId = await firstContractorAccountId(magiisApi, cfg.carrierId);
		test.skip(contractorAccountId === undefined, 'Sin relaciones contractor para derivar {contractorAccountId}');
		const r = await magiisApi.getJson(`contractor/${contractorAccountId}/travelMetrics`);
		// ContractorTravelsDashboardDTO — schema sin propiedades declaradas → shape mínima cuando 200.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});
});
