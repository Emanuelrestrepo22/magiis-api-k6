// tests/specs/controllers/flights.api.test.ts
// FlightsController — cobertura READ-ONLY (solo GET). Proxy a FlightAware AeroAPI (integración externa).
// Rutas exactas: scripts/backend-route-catalog.json (FlightsController) + openapi.yaml.
// getFlights: carrierId=cfg.carrierId, serviceName='AVIATION' (app de vuelos linkeada, validado UAT 2026-07-14),
//   requiere query flightDate. MAGIIS valida el link de la app ANTES de llamar AeroAPI → un serviceName
//   inexistente responde 404 APPLICATION_NOT_FOUND (aserción MAGIIS-side, determinista). Ref: MX-5824/5825/5826.
// Shapes contra openapi (AirlineDTO.iataCode, AirportDTO.iataCode, FlightDTO.flightIata).

import { test, expect } from '@TestBase';
import { expectArray } from '@helpers';

const TOLERANT = [200, 400, 403, 404];
// AeroAPI acepta una ventana futura amplia; mañana mantiene el smoke determinista y en ventana.
const flightDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

test.describe('FlightsController', () => {
	test('Validar GET flights/getAirlines', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('flights/getAirlines');
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ iataCode?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('iataCode');
		}
	});

	test('Validar GET flights/getAirports', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('flights/getAirports');
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ iataCode?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('iataCode');
		}
	});

	test('Validar GET flights/getFlights/{carrierId}/{serviceName}', async ({ magiisApi, cfg }) => {
		// serviceName 'AVIATION' (app linkeada). Integración externa → tolerante; si 200, FlightDTO[].
		const r = await magiisApi.getJson(`flights/getFlights/${cfg.carrierId}/AVIATION`, {
			params: { flightDate, depAirpotIataCode: 'EZE', airlineIataCode: 'AR' }
		});
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ flightIata?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('flightIata');
		}
	});

	test('Validar GET flights/getFlights/{carrierId}/{serviceName} (serviceName inexistente → 404)', async ({
		magiisApi,
		cfg
	}) => {
		// MAGIIS chequea el link de la app ANTES de AeroAPI → 404 APPLICATION_NOT_FOUND (determinista, MAGIIS-side).
		const r = await magiisApi.getJson(`flights/getFlights/${cfg.carrierId}/FOO`, {
			params: { flightDate },
			failOnStatusCode: false
		});
		expect(r.status()).toBe(404);
		const body = (await r.json()) as { errorCode?: string };
		expect(body.errorCode).toBe('APPLICATION_NOT_FOUND');
	});
});
