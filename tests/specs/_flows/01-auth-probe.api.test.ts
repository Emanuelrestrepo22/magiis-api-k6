// tests/specs/_flows/01-auth-probe.api.test.ts
// DRAFT (Fase D del proyecto QA API Magiis · 2026-05-28).
// Portado de _FLOWS_/01_AuthProbe del workspace Postman MAGIIS-QA-API-v2.

import { test, expect } from '@TestBase';

test.describe.serial('[_flows] 01_AuthProbe', () => {
	test('serverInfo público responde 200 (TS-API-FLOW-01.1)', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('config/serverInfo', { auth: false });
		expect(r.status()).toBe(200);
		expect(r.headers()['content-type']).toMatch(/json|text/i);
	});

	test('login devuelve JWT válido (TS-API-FLOW-01.2)', async ({ magiisApi }) => {
		const token = await magiisApi.ensureToken(true);
		expect(token.length).toBeGreaterThan(20);
		expect(token.split('.')).toHaveLength(3);
	});
});
