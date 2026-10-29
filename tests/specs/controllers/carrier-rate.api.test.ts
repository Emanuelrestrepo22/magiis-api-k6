// tests/specs/controllers/carrier-rate.api.test.ts
// CarrierRateController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierRateController) + openapi.yaml.
// carrierUserId = cfg.carrierId. carrierRateId se deriva de getRates. Sin endpoints mutantes.
// Shapes derivados de components.schemas (CarrierRateResponseDTO, CarrierRateRuleResponseDTO).

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';

const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };

test.describe('CarrierRateController', () => {
	test('Validar GET carriers/rate/:carrierUserId', async ({ magiisApi, cfg }) => {
		// getRates → array de CarrierRateResponseDTO.
		const r = await magiisApi.getJson(`carriers/rate/${cfg.carrierId}`, { params: { name: '' } });
		const list = await expectArray<{ id?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	test('Validar GET carriers/rate/default/:carrierUserId', async ({ magiisApi, cfg }) => {
		// getDefaultStandardRate → CarrierRateResponseDTO. Puede no existir tarifa default → tolerante.
		const r = await magiisApi.getJson(`carriers/rate/default/${cfg.carrierId}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	test('Validar GET carriers/rate/paginated/:carrierUserId', async ({ magiisApi, cfg }) => {
		// getRatesByNamePaginated → Spring Page<CarrierRateResponseDTO> (params page/size/search/sort).
		const r = await magiisApi.getJson(`carriers/rate/paginated/${cfg.carrierId}`, {
			params: { ...PAGE_PARAMS, search: '' }
		});
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET carriers/rate/:carrierRateId/detail (derivado de getRates)', async ({ magiisApi, cfg }) => {
		const listRes = await magiisApi.getJson(`carriers/rate/${cfg.carrierId}`, { params: { name: '' } });
		const list = await expectArray<{ id: number }>(listRes);
		test.skip(list.length === 0, 'Sin carrier rates en el ambiente para derivar un carrierRateId');
		// getRateDetail → CarrierRateResponseDTO.
		const r = await magiisApi.getJson(`carriers/rate/${list[0].id}/detail`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	test('Validar GET carriers/rate/:carrierRateId/rule (derivado de getRates)', async ({ magiisApi, cfg }) => {
		const listRes = await magiisApi.getJson(`carriers/rate/${cfg.carrierId}`, { params: { name: '' } });
		const list = await expectArray<{ id: number }>(listRes);
		test.skip(list.length === 0, 'Sin carrier rates en el ambiente para derivar un carrierRateId');
		// getRules → array de CarrierRateRuleResponseDTO.
		const r = await magiisApi.getJson(`carriers/rate/${list[0].id}/rule`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const rules = await expectArray<{ id?: number }>(r);
			if (rules.length > 0) expect(rules[0]).toHaveProperty('id');
		}
	});
});
