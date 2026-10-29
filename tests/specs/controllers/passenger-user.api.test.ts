// tests/specs/controllers/passenger-user.api.test.ts
// DRAFT. PassengerUserController — 56 endpoints, 3 críticos acá.

import { test, expect } from '@TestBase';

test.describe('PassengerUserController', () => {
	test('Validar GET /passengers/carriers/:carrierId', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`passengers/carriers/${cfg.carrierId}`);
		expect([200, 404]).toContain(r.status());
	});

	test('Validar GET /passengers/carriers/:carrierId/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`passengers/carriers/${cfg.carrierId}/paginated`, {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		expect([200, 400, 404]).toContain(r.status());
	});
});
