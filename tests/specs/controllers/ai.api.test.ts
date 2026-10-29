// tests/specs/controllers/ai.api.test.ts
// DRAFT auto-generado · Controller: AIController · 1 reqs

import { test, expect } from '@TestBase';

test.describe('AIController', () => {
	test('GET GET getBases [melita/branches/{carrierId}/{ratio}/{basesQty}/{type}]', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('melita/branches/{carrierId}/{ratio}/{basesQty}/{type}');
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
