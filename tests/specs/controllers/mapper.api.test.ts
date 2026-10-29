// tests/specs/controllers/mapper.api.test.ts
// DRAFT auto-generado · Controller: MapperController · 3 reqs

import { test, expect } from '@TestBase';

test.describe('MapperController', () => {
	test('GET GET getConversionProfileByCarrier [mapper/{carrierId}/conversionProfile]', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('mapper/{carrierId}/conversionProfile');
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST POST createConversionProfile [mapper/{carrierId}/conversionProfile]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('mapper/{carrierId}/conversionProfile', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('DELETE DELETE deleteConversionProfile [mapper/{carrierId}/conversionProfile/{conversionProfileId}]', async ({
		magiisApi
	}) => {
		test.fixme(true, 'Mutating DELETE — validar antes de quitar fixme');

		const r = await magiisApi.deleteJson('mapper/{carrierId}/conversionProfile/{conversionProfileId}');
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
