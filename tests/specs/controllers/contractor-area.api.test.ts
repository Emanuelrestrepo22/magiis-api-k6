// tests/specs/controllers/contractor-area.api.test.ts
// ContractorAreaController — cobertura READ-ONLY (solo GET). Áreas de un contractor.
// Rutas exactas: scripts/backend-route-catalog.json (ContractorAreaController) + openapi.yaml.
// contractorUserId no está en cfg → se deriva del listado de contractors del carrier
// (carrier/{carrierId}/contractors/paginated → content[].contractorId). test.skip si no hay.
// Shape contra components.schemas (ContractorAreaResponseDTO: id, area, identifier, enabled).

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape } from '@helpers';

const PAGE_PARAMS = { page: 0, size: 10 };

test.describe('ContractorAreaController', () => {
	test('Validar GET contractorsAreas/{contractorUserId}', async ({ magiisApi, cfg }) => {
		// contractorUserId se deriva de las relaciones del carrier logueado.
		const relRes = await magiisApi.getJson(`carrier/${cfg.carrierId}/contractors/paginated`, { params: PAGE_PARAMS });
		test.skip(relRes.status() !== 200, 'Relaciones del carrier no disponibles para derivar contractorUserId');
		const rel = await expectPageShape<{ contractorId?: number }>(relRes);
		test.skip(rel.content.length === 0, 'Sin contractors relacionados para derivar contractorUserId');
		// getContractorAreas → array de ContractorAreaResponseDTO.
		const r = await magiisApi.getJson(`contractorsAreas/${rel.content[0].contractorId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number; area?: string }>(r);
			if (list.length > 0) {
				expect(list[0]).toHaveProperty('id');
				expect(list[0]).toHaveProperty('area');
			}
		}
	});

	test('Validar GET contractorsAreas/{contractorUserId}/paginated', async ({ magiisApi, cfg }) => {
		const relRes = await magiisApi.getJson(`carrier/${cfg.carrierId}/contractors/paginated`, { params: PAGE_PARAMS });
		test.skip(relRes.status() !== 200, 'Relaciones del carrier no disponibles para derivar contractorUserId');
		const rel = await expectPageShape<{ contractorId?: number }>(relRes);
		test.skip(rel.content.length === 0, 'Sin contractors relacionados para derivar contractorUserId');
		// getContractorAreasPaginated → Page<ContractorAreaResponseDTO>.
		const r = await magiisApi.getJson(`contractorsAreas/${rel.content[0].contractorId}/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
