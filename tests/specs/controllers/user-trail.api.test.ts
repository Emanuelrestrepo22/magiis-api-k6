// tests/specs/controllers/user-trail.api.test.ts
// DRAFT auto-generado · Controller: UserTrailController · 2 reqs

import { test, expect } from '@TestBase';

test.describe('UserTrailController', () => {
	test('POST POST registerUserTrail [usertrail/register]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('usertrail/register', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('GET GET getUserTrailByCarrier [usertrail/getbycarrier/{carrierId}]', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('usertrail/getbycarrier/{carrierId}');
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
