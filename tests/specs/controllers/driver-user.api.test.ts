// tests/specs/controllers/driver-user.api.test.ts
// DriverUserController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (DriverUserController).
// Shapes: openapi.yaml (DriverBasicResponseDTO, DriverResponseDTO, DriverLastPlaceResponseDTO,
// DriverReportLocationResponseDTO). {driverUserId} = cfg.driverId; el driver puede no existir en cada
// ambiente → status tolerante [200,400,403,404] + shape si 200 (el set ya descarta 5xx).
// Endpoints mutantes (POST reportLocation/appKilling/refreshStatus/setFromApp..., PUT update/operability/
// setAppVersion/setFirebaseToken/updateImage/reSendEmailConfirmation/refreshStatusAdm) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';

test.describe('DriverUserController', () => {
	// ── getBasicInfo → DriverBasicResponseDTO (driverUserId required) ──
	test('Validar GET drivers/basicInfo/{driverUserId}', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/basicInfo/${cfg.driverId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'driverUserId');
	});

	// ── getById → DriverResponseDTO (driverUserId required) ──
	test('Validar GET drivers/{driverUserId}', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/${cfg.driverId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'driverUserId');
	});

	// ── getLastLocation → DriverLastPlaceResponseDTO (driverUserId required) ──
	test('Validar GET drivers/{driverUserId}/reportLocation', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/${cfg.driverId}/reportLocation`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'driverUserId');
	});

	// ── getReportDriverLocationTable → array<DriverReportLocationResponseDTO> (item: driverId) ──
	// fixme: Backend 500 sin datos de location table para el driver de prueba.
	test.fixme('Validar GET drivers/reportDriverLocationTable/{driverUserId}', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`drivers/reportDriverLocationTable/${cfg.driverId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ driverId?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('driverId');
		}
	});
});
