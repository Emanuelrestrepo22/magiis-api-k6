// tests/specs/controllers/carrier-contractor-relation.api.test.ts
// CarrierContractorRelationController — cobertura READ-ONLY (solo GET). Relaciones carrier↔contractor.
// Rutas exactas: scripts/backend-route-catalog.json (CarrierContractorRelationController) + openapi.yaml.
// carrierId = cfg.carrierId (recurso propio → assert fuerte). contractorId no está en cfg →
// se deriva del listado de contractors del carrier (content[].contractorId), test.skip si vacío.
// Shape contra components.schemas (CarrierContractorRelationDTO: id, contractorId, carrierId, active).

import { test, expect } from '@TestBase';
import { expectPageShape } from '@helpers';

const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };

test.describe('CarrierContractorRelationController', () => {
	test('Validar GET carrier/{carrierId}/contractors/paginated', async ({ magiisApi, cfg }) => {
		// getCarrierRelations → Page<CarrierContractorRelationDTO>. carrierId propio → assert fuerte 2xx.
		// backend hace Optional.get() unguarded sobre 'find': sin él → 500 "No value present". find:'' → 200 (confirmado prod).
		const r = await magiisApi.getJson(`carrier/${cfg.carrierId}/contractors/paginated`, {
			params: { ...PAGE_PARAMS, find: '' }
		});
		const page = await expectPageShape<{ id?: number; contractorId?: number }>(r);
		if (page.content.length > 0) expect(page.content[0]).toHaveProperty('contractorId');
	});

	test('Validar GET contractor/{contractorId}/carriers/paginated (derivado de getCarrierRelations)', async ({
		magiisApi,
		cfg
	}) => {
		// contractorId no está en cfg → derivar de las relaciones del carrier.
		// backend hace Optional.get() unguarded sobre 'find': sin él → 500 "No value present". find:'' → 200 (confirmado prod).
		const relRes = await magiisApi.getJson(`carrier/${cfg.carrierId}/contractors/paginated`, {
			params: { ...PAGE_PARAMS, find: '' }
		});
		const relPage = await expectPageShape<{ contractorId?: number }>(relRes);
		test.skip(relPage.content.length === 0, 'Sin contractors relacionados para derivar contractorId');
		const contractorId = relPage.content[0].contractorId;
		test.skip(typeof contractorId !== 'number', 'contractorId ausente en la relación derivada');
		// getContractorRelations → Page<CarrierContractorRelationDTO>. Vista contractor-scoped → tolerante.
		// mismo patrón backend: 'find' requerido (Optional.get unguarded). find:'' → evita 500 "No value present".
		const r = await magiisApi.getJson(`contractor/${contractorId}/carriers/paginated`, {
			params: { ...PAGE_PARAMS, find: '' }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
