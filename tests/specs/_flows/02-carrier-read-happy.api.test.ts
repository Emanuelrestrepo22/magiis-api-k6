// tests/specs/_flows/02-carrier-read-happy.api.test.ts
// DRAFT. Portado de _FLOWS_/02_CarrierReadHappy.

import { test, expect } from '@TestBase';
import { expect2xx, expectArray } from '@helpers';

test.describe.serial('[_flows] 02_CarrierReadHappy', () => {
	test('GET /carriers/:carrierId retorna detalle', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}`);
		await expect2xx(r);
		const body = (await r.json()) as { id?: number };
		expect(body.id).toBe(cfg.carrierId);
	});

	test('GET /carriers/:carrierId/carrierArea retorna lista (performance flag)', async ({ magiisApi, cfg }) => {
		// Performance flag conocido (smoke 2026-05-28): ~4.2s con response ~339 KB
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierArea`, { timeout: 10_000 });
		await expectArray(r);
	});

	test('GET /cards/:carrierId/cardTypes retorna lista', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`cards/${cfg.carrierId}/cardTypes`);
		await expectArray(r);
	});
});
