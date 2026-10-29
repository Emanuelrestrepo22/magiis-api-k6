// tests/specs/controllers/carrier-account.api.test.ts
// DRAFT. CarrierAccountController — 78 endpoints en backend, 5 críticos acá.

import { test, expect } from '@TestBase';
import { expect2xx, expectArray } from '@helpers';

test.describe('CarrierAccountController', () => {
	test('Validar GET /carriers/:carrierId retorna detalle del carrier', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}`);
		await expect2xx(r);
		const body = (await r.json()) as { id?: number };
		expect(body.id).toBe(cfg.carrierId);
	});

	test('Validar GET /carriers/:carrierId/carrierArea (performance flag)', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierArea`, { timeout: 10_000 });
		await expectArray(r);
	});

	test('Validar GET /carriers/list', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('carriers/list');
		expect([200, 400, 404]).toContain(r.status());
	});

	test('Validar GET /carriers/:carrierId/users', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/users`);
		expect([200, 404]).toContain(r.status());
	});

	test('Validar GET /carriers/:carrierId/transports', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/transports`);
		expect([200, 404]).toContain(r.status());
	});
});
