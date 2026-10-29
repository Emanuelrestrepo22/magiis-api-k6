// tests/specs/controllers/user.api.test.ts
// DRAFT auto-generado · Controller: UserController · 5 reqs

import { test, expect } from '@TestBase';

test.describe('UserController', () => {
	test('POST Magiis-verifyUserPermission [verifyUserPermission]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('verifyUserPermission', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST searchEmailExists [searchEmailExists]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('searchEmailExists', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST updateFirebaseToken [updateFirebaseToken]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('updateFirebaseToken', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST resetPassword [resetPassword]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('resetPassword', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST refreshToken [refreshToken]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('refreshToken', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
