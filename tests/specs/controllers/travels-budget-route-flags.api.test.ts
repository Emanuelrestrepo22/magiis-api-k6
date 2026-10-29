// tests/specs/controllers/travels-budget-route-flags.api.test.ts
// TM-937 (Xray TM) — BUG-MG-682: POST carriers/{carrierId}/travels/budget calculaba el costo del
// viaje para la ruta correcta del carrier. Componente: TravelsApi.requestBudgetResolvesAgainstCarrierParameter.
//
// SKIPPED — ENDPOINT REMOVIDO DEL BACKEND (CONTRACT_CHANGE, no defecto del test):
// `POST carriers/{carrierId}/travels/budget` fue eliminado en TravelController.java:999-1046
// @release/v1.72.19, dentro de un bloque comentado (`COMENTADO PEDIDO POR SEBA PORQUE AL PARECER
// NO SE USA`), commit 07f8f4c5 (MG-995, 2026-09-09); igual en develop. Spring responde 405 porque
// la ruta cae en @GetMapping("{travelId}"). No hay reemplazo 1:1: la cotización se cubre con
// simulate/simulateAll (TM-945).
// Pendiente: que el PO retire TC08/TM-937 del ATP. El ATC y este spec se conservan a propósito
// para reactivarlos si el endpoint vuelve.
//
// Gherkin original del caso (hoy no ejecutable):
//   Dado que el carrier X tiene PARAMETERS.FASTEST_ROUTE = <valor>,
//   cuando llamo a POST carriers/X/travels/budget con el body base,
//   entonces la respuesta HTTP es 200 y la ruta/costo corresponden a ruta más rápida / más corta.
//

import { test, expect } from '@TestBase';
import { mg682Data } from '@data/mg682';

test.describe('TravelController — TM-937: costo del viaje contra el parámetro del carrier (travels/budget)', () => {
	test('TM-937: debería resolver el costo del viaje vía travels/budget para el carrier del entorno activo', async ({
		travels,
		carrierParameters
	}) => {
		test.skip(
			true,
			'Endpoint POST carriers/{carrierId}/travels/budget removido del backend (TravelController.java:999-1046@release/v1.72.19, bloque comentado, commit 07f8f4c5, MG-995, 2026-09-09; igual en develop). Spring responde 405 porque la ruta cae en @GetMapping("{travelId}"). Sin reemplazo 1:1: la cotizacion se cubre con simulate/simulateAll (TM-945). Pendiente: PO retira TC08/TM-937 del ATP.'
		);
		const { carrierId, route } = mg682Data();

		const params = await carrierParameters.readRouteFlagParameters(carrierId);
		test.skip(
			!params,
			`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
		);

		const res = await travels.requestBudgetResolvesAgainstCarrierParameter(carrierId, route);
		const body = (await res.json()) as { finalPrice?: number };
		expect(body.finalPrice, 'finalPrice debe ser numérico y > 0').toBeGreaterThan(0);

		const oracleRes = await travels.requestTimesWithExplicitFastestRoute(carrierId, {
			...route,
			fastestRoute: params!.fastestRoute
		});
		const oracleBody = (await oracleRes.json()) as { distance?: number; duration?: number };
		test.info().annotations.push({
			type: 'route-oracle',
			description:
				`carrier ${carrierId}, fastestRoute=${params!.fastestRoute} (PARAMETERS) → distance=${oracleBody.distance} ` +
				`duration=${oracleBody.duration} (travels/budget no devuelve geometría; comparación documentada, no aseverada)`
		});
	});

	test('TM-937: debería resolver el costo del viaje vía travels/budget para un carrier con PARAMETERS.FASTEST_ROUTE=true', async ({
		travels,
		carrierParameters
	}) => {
		test.skip(
			true,
			'Endpoint POST carriers/{carrierId}/travels/budget removido del backend (TravelController.java:999-1046@release/v1.72.19, bloque comentado, commit 07f8f4c5, MG-995, 2026-09-09; igual en develop). Spring responde 405 porque la ruta cae en @GetMapping("{travelId}"). Sin reemplazo 1:1: la cotizacion se cubre con simulate/simulateAll (TM-945). Pendiente: PO retira TC08/TM-937 del ATP.'
		);
		const { carrierWithFastestRouteTrueId, route } = mg682Data();
		test.skip(
			carrierWithFastestRouteTrueId === null,
			'requiere un carrier con PARAMETERS.FASTEST_ROUTE=true accesible con la credencial del entorno; no disponible en producción'
		);
		const carrierId = carrierWithFastestRouteTrueId!;

		const params = await carrierParameters.readRouteFlagParameters(carrierId);
		test.skip(
			!params,
			`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
		);

		const res = await travels.requestBudgetResolvesAgainstCarrierParameter(carrierId, route);
		const body = (await res.json()) as { finalPrice?: number };
		expect(body.finalPrice, 'finalPrice debe ser numérico y > 0').toBeGreaterThan(0);

		const oracleRes = await travels.requestTimesWithExplicitFastestRoute(carrierId, {
			...route,
			fastestRoute: params!.fastestRoute
		});
		const oracleBody = (await oracleRes.json()) as { distance?: number; duration?: number };
		test.info().annotations.push({
			type: 'route-oracle',
			description:
				`carrier ${carrierId}, fastestRoute=${params!.fastestRoute} (PARAMETERS) → distance=${oracleBody.distance} ` +
				`duration=${oracleBody.duration} (travels/budget no devuelve geometría; comparación documentada, no aseverada)`
		});
	});
});
