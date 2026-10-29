// tests/specs/controllers/driver-account.api.test.ts
// DRAFT. DriverAccountController — 26 endpoints, 4 críticos acá.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

test.describe('DriverAccountController', () => {
	test('Validar GET /drivers/:driverId', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/${cfg.driverId}`);
		await expect2xx(r);
		const body = (await r.json()) as { driverUserId?: number };
		expect(body.driverUserId).toBe(cfg.driverId);
	});

	test('Validar GET /drivers/:driverId/vehicles', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/${cfg.driverId}/vehicles`);
		expect([200, 404]).toContain(r.status());
	});

	test('Validar GET /drivers/carriers/:carrierId', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/carriers/${cfg.carrierId}`);
		expect([200, 404]).toContain(r.status());
	});

	test('Validar GET /drivers/:driverId/state', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/${cfg.driverId}/state`);
		expect([200, 404]).toContain(r.status());
	});
});
