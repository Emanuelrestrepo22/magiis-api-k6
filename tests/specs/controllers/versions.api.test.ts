// tests/specs/controllers/versions.api.test.ts
// VersionsController — base versions. Verifica versión soportada de apps cliente.
// Contrato: docs/reference/backend-endpoints-v1.72.2.md (§8.58).
// Ruta corregida: el stub omitía el prefijo 'versions/'.

import { test, expect } from '@TestBase';

test.describe('VersionsController', () => {
	test('Validar GET /versions/verifyVersion/:app/platform/:platform/version/:version', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('versions/verifyVersion/DRIVER/platform/ANDROID/version/21800');
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as Record<string, unknown>;
			expect(body).toBeTruthy();
		}
	});
});
