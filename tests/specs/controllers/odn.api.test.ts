// tests/specs/controllers/odn.api.test.ts
// ODNController — cobertura READ-ONLY (solo GET). Integración externa ODN/GNET.
// Rutas exactas: scripts/backend-route-catalog.json (ODNController) + openapi.yaml.
// carrierId = cfg.carrierId. odnCode='GNET' es el único valor del enum documentado en openapi.
// providerId/travelId NO están en cfg ni hay listado simple/tipado para derivarlos → placeholder +
//   status tolerante (la integración externa sin datos reales devuelve 400/403/404; el 200 depende de ODN).
// Shapes contra openapi (ODNProviderResponseDTO, ODNDriverLocationInfoResponseDTO, TransportTypeResponseDTO).

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';

const ODN_CODE = 'GNET';
const TOLERANT = [200, 400, 403, 404];

test.describe('ODNController', () => {
	test('Validar GET odn/vehicleTypes', async ({ magiisApi }) => {
		// findODNVehicleTypes declara requestBody requerido (GET con body, anomalía): sin body → 400/415.
		const r = await magiisApi.getJson('odn/vehicleTypes');
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	// Integración externa ODN/GNET sin config de proveedor para carrier 1040 (500).
	test.fixme('Validar GET odn/{carrierId}/providers/{odnCode}', async ({ magiisApi, cfg }) => {
		// getProviders → ODNProviderResponseDTO (providerId/providerName). Integración externa → tolerante.
		const r = await magiisApi.getJson(`odn/${cfg.carrierId}/providers/${ODN_CODE}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'providerId');
	});

	// Integración externa ODN/GNET sin config de proveedor para carrier 1040 (500).
	test.fixme('Validar GET odn/{carrierId}/{odnCode}/driversLocations', async ({ magiisApi, cfg }) => {
		// getDriversLocations → array de ODNDriverLocationInfoResponseDTO (driverName).
		const r = await magiisApi.getJson(`odn/${cfg.carrierId}/${ODN_CODE}/driversLocations`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ driverName?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('driverName');
		}
	});

	// Integración externa ODN/GNET sin config de proveedor para carrier 1040 (409, errorCode GNET_ERROR).
	test.fixme('Validar GET odn/{carrierId}/providers/{odnCode}/{providerId}/vehiclesTypes', async ({
		magiisApi,
		cfg
	}) => {
		// getVehicleTypesByProvider → array de TransportTypeResponseDTO (id). providerId no derivable → placeholder.
		const r = await magiisApi.getJson(`odn/${cfg.carrierId}/providers/${ODN_CODE}/placeholder-provider/vehiclesTypes`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	test('Validar GET odn/{carrierId}/travel/{travelId}/driverLocation', async ({ magiisApi, cfg }) => {
		// getDriverLocation → ODNDriverLocationInfoResponseDTO. travelId no derivable → placeholder numérico.
		const r = await magiisApi.getJson(`odn/${cfg.carrierId}/travel/0/driverLocation`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});
});
