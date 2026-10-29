// tests/specs/controllers/magiis-emergency.api.test.ts
// DRAFT auto-generado · Controller: MagiisEmergencyController · 1 reqs

import { test, expect } from '@TestBase';

test.describe('MagiisEmergencyController', () => {
	test('POST createSos [driverSos]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('driverSos', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
