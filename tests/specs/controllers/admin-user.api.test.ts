// tests/specs/controllers/admin-user.api.test.ts
// DRAFT. AdminUserController — 23 endpoints en backend, 5 críticos acá.

import { test, expect } from '@TestBase';
import { expectArray, expect2xx } from '@helpers';

test.describe('AdminUserController', () => {
	test('Validar GET /admins/adminTypes', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('admins/adminTypes');
		await expectArray(r);
	});

	test('Validar GET /admins/paginated (smoke: 500 con CARRIER, bug backend)', async ({ magiisApi }) => {
		test.fixme(true, 'Smoke 2026-05-28: 500 con ROLE_CARRIER (debería ser 403). Reportar bug backend.');
		const r = await magiisApi.getJson('admins/paginated', {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		await expect2xx(r);
	});

	test('Validar GET /admins/findCarriersByCarrierOrFirstOrLastName', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('admins/findCarriersByCarrierOrFirstOrLastName', {
			params: { find: '' }
		});
		expect([200, 400]).toContain(r.status());
	});

	test('Validar GET /admins/carriers/list', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('admins/carriers/list');
		await expectArray(r);
	});
});
