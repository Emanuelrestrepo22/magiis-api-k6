// tests/specs/controllers/carrier-other-cost.api.test.ts
// DRAFT auto-generado · Controller: CarrierOtherCostController · 4 reqs

import { test, expect } from '@TestBase';

test.describe('CarrierOtherCostController', () => {
	test('POST addCarrierOtherCost [1040/otherCosts/new]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('1040/otherCosts/new', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('PUT updateCarrierOtherCost [1040/otherCosts/update]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating PUT — validar antes de quitar fixme');

		const r = await magiisApi.putJson('1040/otherCosts/update', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST searchCarrierOtherCostSearch [1040/otherCosts/search]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('1040/otherCosts/search', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST deleteCarrierOtherCost [1040/otherCosts/delete]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('1040/otherCosts/delete', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
