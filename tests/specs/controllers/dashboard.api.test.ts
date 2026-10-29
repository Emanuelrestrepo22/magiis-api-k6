// tests/specs/controllers/dashboard.api.test.ts
// DRAFT auto-generado · Controller: DashboardController · 4 reqs

import { test, expect } from '@TestBase';

test.describe('DashboardController', () => {
	test('GET GET getDriverSurrenderDashboard [carriers/{carrierId}/dashboard/driversSurrenderState]', async ({
		magiisApi
	}) => {
		const r = await magiisApi.getJson('carriers/{carrierId}/dashboard/driversSurrenderState');
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST POST getGeneralDashboardMonthlyStatistics [carriers/{carrierId}/dashboard/monthlyStatistics/general]', async ({
		magiisApi
	}) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('carriers/{carrierId}/dashboard/monthlyStatistics/general', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST POST getDashboardMontlyStatisticsByVehicles [carriers/{carrierId}/dashboard/monthlyStatistics/byVehicles]', async ({
		magiisApi
	}) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('carriers/{carrierId}/dashboard/monthlyStatistics/byVehicles', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST POST getDashboardMonthlyStatisticsByDrivers [carriers/{carrierId}/dashboard/monthlyStatistics/byDrivers]', async ({
		magiisApi
	}) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('carriers/{carrierId}/dashboard/monthlyStatistics/byDrivers', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
