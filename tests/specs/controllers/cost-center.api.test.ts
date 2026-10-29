// tests/specs/controllers/cost-center.api.test.ts
// CostCenterController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CostCenterController).
// Shapes: openapi.yaml (SelectComponentResponseDTO, CostCenterResponseDTO, Page inline content+totalElements).
// {contractorUserId} NO está en cfg (es un id de contractor, no de carrier); se sondea con cfg.carrierId
// como valor de runtime y se tolera 400/403/404. {costCenterId} se deriva del listado paginado (skip si vacío).
// Endpoints mutantes (POST create, PUT updateCostCenter) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectPageShape, expectObjectWithProperty } from '@helpers';

const PAGE_PARAMS = { page: 0, size: 10 };

test.describe('CostCenterController', () => {
	// ── get → SelectComponentResponseDTO (contractor-scoped por JWT; rol carrier puede 403) ──
	// El contrato documenta un objeto único, pero el componente de selección suele devolver
	// colección; se valida body truthy para no acoplar a una forma ambigua (igual detecta 5xx).
	test('Validar GET costCenters', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('costCenters');
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	// ── contractorUserId sondeado con cfg.carrierId → Page<CostCenterResponseDTO> ──
	test('Validar GET costCenters/{contractorUserId}/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`costCenters/${cfg.carrierId}/paginated`, { params: PAGE_PARAMS });
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	// ── costCenterId derivado del paginado (id required en CostCenterResponseDTO) ──
	test('Validar GET costCenters/{contractorUserId}/costCenters/{costCenterId}', async ({ magiisApi, cfg }) => {
		const src = await magiisApi.getJson(`costCenters/${cfg.carrierId}/paginated`, { params: PAGE_PARAMS });
		let costCenterId: number | undefined;
		if (src.status() === 200) {
			const body = (await src.json()) as { content?: Array<{ id?: number }> };
			if (Array.isArray(body.content) && body.content.length > 0) costCenterId = body.content[0].id;
		}
		test.skip(costCenterId === undefined, 'Sin cost centers en el ambiente para derivar {costCenterId}');
		const r = await magiisApi.getJson(`costCenters/${cfg.carrierId}/costCenters/${costCenterId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});
});
