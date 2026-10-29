// tests/specs/controllers/config.api.test.ts
// DRAFT. ConfigController — endpoint público de healthcheck.

import { test, expect } from '@TestBase';

test.describe('ConfigController (public smoke)', () => {
	test('Validar GET /config/serverInfo público responde 200 @smoke', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('config/serverInfo', { auth: false });
		expect(r.status()).toBe(200);
		expect(r.headers()['content-type']).toMatch(/json|text/i);
	});
});
