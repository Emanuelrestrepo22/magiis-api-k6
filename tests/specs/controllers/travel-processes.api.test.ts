// tests/specs/controllers/travel-processes.api.test.ts
// DRAFT auto-generado · Controller: TravelProcessesController · 1 reqs

import { test, expect } from '@TestBase';

test.describe('TravelProcessesController', () => {
	test('POST POST finalizeFromWebCron [carriers/travels/finalizeFromWebCron]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('carriers/travels/finalizeFromWebCron', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
