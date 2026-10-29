// tests/specs/_flows/04-driver-readonly.api.test.ts
// DRAFT. Portado de _FLOWS_/04_DriverReadonly.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

test.describe.serial('[_flows] 04_DriverReadonly', () => {
	test('GET /drivers/:driverId retorna detalle', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/${cfg.driverId}`);
		await expect2xx(r);
		const body = (await r.json()) as { driverUserId?: number };
		expect(body.driverUserId).toBe(cfg.driverId);
	});

	test('GET /drivers/:driverId/vehicles retorna lista o 404', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/${cfg.driverId}/vehicles`);
		expect([200, 404]).toContain(r.status());
	});
});
