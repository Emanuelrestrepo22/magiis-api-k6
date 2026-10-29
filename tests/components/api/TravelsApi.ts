// tests/components/api/TravelsApi.ts
// KATA Architecture — Layer 3: componente del dominio Travels (tiempos/distancia + alta/edición/
// simulación/cancelación de viaje).
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - Trae el ATC de TM-934 (TC05, /travels/times) y los CUATRO ATCs de TM-945 (TC16 — alta real,
//     simulate, simulateAll, update), que comparten construcción de payload vía los helpers
//     privados `buildTravelCreateBody`/`applyRouteFlags`. También el ATC de TM-937 (travels/budget
//     — el DTO no declara flags de ruta). `findRequesterUserId` es Discover (@step, silent fail)
//     para el `requesterUserId` obligatorio del alta.
//   - `cancelTravel` es la acción de limpieza (PÚBLICA, SIN `@atc`) que cancela lo dado de alta
//     por create/update — PUT .../travels/{travelId}/cancel, con el body real de
//     CancelTravelRequestDTO (canceledBy/reasonForCancellation/...; openapi.yaml NO lo refleja).
//   - `requestTimesWithExplicitFastestRoute` es soporte (PÚBLICO, SIN `@atc`): oráculo de TM-937
//     (ver ese spec) — no es la acción bajo prueba de ningún Test de Xray.
//
// TICKET: BUG-MG-682 — los flujos ya-correctos de resolución de flags de ruta (fastestRoute/
// avoidTolls/avoidHighways) contra PARAMETERS del carrier siguen comportándose igual, con el flag
// omitido o explícito. TM-934 cubre /travels/times (solo cómputo); TM-945 cubre la matriz completa
// de endpoints que aceptan los tres flags (alta real, simulate, simulateAll, update) — la
// trifuerza queda cerrada acá: el registro TRAVEL debe persistir el flag SIN NULL en cualquiera de
// esas rutas. TM-937 cubre /travels/budget, que NO declara flags de ruta en su DTO.

import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';
import { readJsonSafe } from '@helpers';
import { mg682OriginToken } from '@data/mg682';
import type { TravelRequestBody } from '@data/f2';
import { markCallDone, pace } from '@data/f2/pace';

export interface RoutePoints {
	origin: { placeId: string; latitude: string; longitude: string };
	destination: { placeId: string; latitude: string; longitude: string };
}

/** Punto de PlaceRequestDTO — `latitude`/`longitude` son los únicos campos required del schema. */
export interface TravelPlace {
	latitude: string;
	longitude: string;
	placeId?: string;
}

/**
 * Los tres flags de ruta de MG-682 — `undefined` = la clave se omite del body (JSON), nunca se
 * envía `null`. Forma compartida por los CUATRO ATCs de alta/simulación/edición de viaje de
 * TM-945 (createTravelWithRouteFlag / simulateTravelWithRouteFlag / simulateAllTravelWithRouteFlag
 * / updateTravelWithRouteFlag).
 */
export interface RouteFlagsArgs {
	avoidTolls?: boolean;
	avoidHighways?: boolean;
	fastestRoute?: boolean;
}

/**
 * Payload verificado contra `TravelCreateRequestDTO` (openapi.yaml) + confirmación en vivo (TEST,
 * 2026-09-08): el schema marca `required` solo destination/origin/originToken/paymentMethod/
 * platform/requesterUserId/travelPreferences, pero el backend además exige `passengerUserId`
 * (no está en `required` — probablemente primitivo `Long` sin `@NotNull` en el DTO Java, pero el
 * service SÍ hace `passengerRepository.findById(passengerUserId)`); omitirlo responde 404
 * `ACTION_NOT_ALLOWED` / `IllegalArgumentException: The given id must not be null!`. Confirmado
 * enviando el mismo id en `requesterUserId` y `passengerUserId` (ambos resueltos por
 * `findRequesterUserId`, contra `carriers/{carrierId}/clients`).
 * `travelPreferences.airConditioner/luggage/mascots` son los únicos required de
 * `TravelPreferencesRequestDTO` (también primitivos `boolean`, no bloquean si se omiten, pero se
 * envían explícitos por contrato). Mismo DTO que usan `simulate`/`simulateAll` (ver openapi.yaml).
 */
export interface CreateTravelArgs extends RouteFlagsArgs {
	origin: TravelPlace;
	destination: TravelPlace;
	requesterUserId: number;
	/**
	 * Zona horaria IANA de la dirección de recogida (el front la deriva de las coordenadas del origen).
	 * Opcional solo por el DTO compartido con alta/update; simulate/simulateAll DEBEN enviarla (omitirla
	 * hace que el backend responda 400 "zoneId"). La clave se omite del body si es `undefined`.
	 */
	pickupGmt?: string;
}

/**
 * Args del ATC de edición (`PUT carriers/{carrierId}/travels/{travelId}/update`) — el DTO
 * (`TravelUpdateRequestDTO`, verificado en openapi.yaml) declara los tres flags de ruta pero solo
 * exige `destination`/`origin`; NO lleva `originToken`/`paymentMethod`/`platform`/
 * `requesterUserId`/`travelPreferences` (esos son de `TravelCreateRequestDTO`, no de este DTO).
 */
export interface UpdateTravelArgs extends RouteFlagsArgs {
	travelId: number;
	origin: TravelPlace;
	destination: TravelPlace;
}

/** Endpoint de cotización/alta de viaje que acepta el body del request real de V2. */
export type TravelRequestEndpoint = 'simulate' | 'simulateAll' | 'create';

/** Shape de error controlado del backend (`{ errorCode, description }`). */
export interface ControlledErrorBody {
	errorCode?: string;
	description?: string;
}

/**
 * Desglose de `simulate` / un elemento de `simulateAll` (campos de F2 — MG-1004/MG-1537). `currency`,
 * `carrierRateByCost` y `pricePointToPointCost` NO figuran en `openapi.yaml` (snapshot previo a F2): se tipan acá
 * y no desde `tests/generated` (R-6 del plan PK-A).
 */
export interface SimulationBreakdown {
	rateId?: number;
	rateName?: string;
	transportTypeId?: number;
	currency?: { currencyId?: number; code?: string; symbol?: string };
	carrierRateByCost?: boolean;
	pricePointToPoint?: number;
	pricePointToPointCost?: number;
	totalCostPrice?: number;
	waitTotalPriceCost?: number;
	taxiingCostPriceCost?: number;
	fixConceptsCost?: number;
	taxesCost?: number;
}

/** Resultado de `simulateReturnsSameBreakdownAsSimulateAll`: las dos respuestas ya parseadas, para la evidencia. */
export interface SimulationParity {
	simulate: SimulationBreakdown;
	simulateAll: SimulationBreakdown[];
	/** Elemento de `simulateAll` emparejado por `transportTypeId` = `vehicleTypeId` del request. */
	paired: SimulationBreakdown;
}

/** Valor de `checkExceedingLimit` (openapi: EXCEEDED | NOT_EXCEEDED | ALLOWED_TO_EXCEED). */
export type ExceedingLimitStatus = 'EXCEEDED' | 'NOT_EXCEEDED' | 'ALLOWED_TO_EXCEED';

/** Valores de `currencyId` que el ATC de moneda del carrier puede enviar: `'omit'` = la clave no viaja. */
export type CurrencyIdVariant = 'omit' | null | number;

export class TravelsApi extends ApiBase {
	/**
	 * ATC: solicita tiempos/distancia SIN enviar avoidTolls/avoidHighways/fastestRoute; a
	 * diferencia de FrequentDestinationApi, este DTO NO tiene default de campo — omitir la clave
	 * sí produce null real, y TravelController lo resuelve ANTES del mapper.
	 * Fixed assertions:
	 *  - HTTP 200
	 */
	@atc('TM-934', { description: 'travels/times — flags contra el parámetro del carrier' })
	async requestTimesOmittingFlagsResolvesAgainstCarrierParameter(
		carrierId: number,
		route: RoutePoints
	): Promise<APIResponse> {
		const originToken = `qa-mg682-auto-${carrierId}-${Date.now()}`;
		const res = await this.api.postJson(`carriers/${carrierId}/travels/times`, { originToken, ...route });
		expect(res.status()).toBe(200);
		return res;
	}

	/**
	 * ATC: alta real de viaje (POST carriers/{carrierId}/travels) con los tres flags de ruta
	 * omitidos o explícitos; TravelController debe resolver el flag contra PARAMETERS del carrier
	 * del path cuando la clave no viaja, y respetar el valor explícito cuando sí viaja — nunca
	 * persistir NULL en ninguno de los dos casos (assert de valor exacto lo hace el spec vía DB).
	 * Fixed assertions:
	 *  - HTTP 200
	 */
	@atc('TM-945', { description: 'travels — alta real, flags contra el parámetro del carrier' })
	async createTravelWithRouteFlag(carrierId: number, args: CreateTravelArgs): Promise<APIResponse> {
		const body = this.buildTravelCreateBody(args, 'TM945-CREATE');
		const res = await this.api.postJson(`carriers/${carrierId}/travels`, body);
		expect(res.status()).toBe(200);
		return res;
	}

	/**
	 * ATC: simula el costo del viaje (POST carriers/{carrierId}/travels/simulate) — mismo DTO de
	 * request que el alta (`TravelCreateRequestDTO`, ver openapi.yaml). No persiste un Travel, pero
	 * la resolución de flags de ruta contra PARAMETERS del carrier es el mismo contrato bajo
	 * prueba (verificable vía MAGIIS_ROUTES, tabla de caché por par origen/destino).
	 * Fixed assertions:
	 *  - HTTP 200
	 */
	@atc('TM-945', { description: 'travels/simulate — flags contra el parámetro del carrier' })
	async simulateTravelWithRouteFlag(carrierId: number, args: CreateTravelArgs): Promise<APIResponse> {
		const body = this.buildTravelCreateBody(args, 'TM945-SIM');
		const res = await this.api.postJson(`carriers/${carrierId}/travels/simulate`, body);
		const text = await res.text();
		expect(
			res.status(),
			`POST carriers/${carrierId}/travels/simulate -> HTTP ${res.status()}: ${text.slice(0, 300)}`
		).toBe(200);
		return res;
	}

	/**
	 * ATC: simula el costo del viaje contra todas las tarifas del carrier (POST
	 * carriers/{carrierId}/travels/simulateAll) — mismo DTO de request que el alta, respuesta
	 * ARRAY de `SimulationPriceInformationResponseDTO` (ver openapi.yaml).
	 * Fixed assertions:
	 *  - HTTP 200
	 *  - Cuerpo es un array
	 */
	@atc('TM-945', { description: 'travels/simulateAll — flags contra el parámetro del carrier' })
	async simulateAllTravelWithRouteFlag(carrierId: number, args: CreateTravelArgs): Promise<APIResponse> {
		const body = this.buildTravelCreateBody(args, 'TM945-SIMALL');
		const res = await this.api.postJson(`carriers/${carrierId}/travels/simulateAll`, body);
		const text = await res.text();
		expect(
			res.status(),
			`POST carriers/${carrierId}/travels/simulateAll -> HTTP ${res.status()}: ${text.slice(0, 300)}`
		).toBe(200);
		const arr = await readJsonSafe<unknown[]>(res);
		expect(Array.isArray(arr), 'simulateAll debe responder un array').toBe(true);
		return res;
	}

	/**
	 * ATC: edita un viaje existente (PUT carriers/{carrierId}/travels/{travelId}/update) — DTO
	 * `TravelUpdateRequestDTO` (ver openapi.yaml), que SÍ declara avoidTolls/avoidHighways/
	 * fastestRoute pero solo exige destination/origin. Confirma que la omisión del flag se
	 * re-resuelve contra PARAMETERS del carrier de forma independiente del alta (el spec crea el
	 * viaje con un valor semilla CONTRARIO antes de llamar a este ATC — ver spec de TM-945).
	 * Fixed assertions:
	 *  - HTTP 200
	 */
	@atc('TM-945', { description: 'travels/update — flags contra el parámetro del carrier' })
	async updateTravelWithRouteFlag(carrierId: number, args: UpdateTravelArgs): Promise<APIResponse> {
		const body: Record<string, unknown> = { origin: args.origin, destination: args.destination };
		this.applyRouteFlags(body, args);
		const res = await this.api.putJson(`carriers/${carrierId}/travels/${args.travelId}/update`, body);
		expect(res.status()).toBe(200);
		return res;
	}

	/**
	 * ATC: solicita el costo del viaje (POST carriers/{carrierId}/travels/budget) con el body base
	 * completo del DTO (`TravelBudGetRequestDTO`, ver openapi.yaml) — ese DTO NO declara ningún
	 * flag de ruta, así que no hay nada de MG-682 que enviar ni aseverar sobre el propio cuerpo de
	 * la respuesta (`ToPayResponseDTO` = `{finalPrice, paymentMethods}`).
	 * Fixed assertions:
	 *  - HTTP 200
	 */
	@atc('TM-937', { description: 'travels/budget — costo del viaje (DTO sin flags de ruta)' })
	async requestBudgetResolvesAgainstCarrierParameter(carrierId: number, route: RoutePoints): Promise<APIResponse> {
		const body = {
			originToken: mg682OriginToken('TM937'),
			origin: route.origin,
			destination: route.destination,
			additionalStop: 0,
			dayTime: new Date().toISOString(),
			parking: 0,
			paymentMethod: 'CASH',
			toll: 0,
			waitTime: 0
		};
		const res = await this.api.postJson(`carriers/${carrierId}/travels/budget`, body);
		expect(res.status()).toBe(200);
		return res;
	}

	/**
	 * ATC (contrato de API, TM-1423 · MG-1004-AC1): simulateAll con una moneda que ningún tarifador del
	 * árbol del pasajero factura debe rechazarse con 409 controlado `RATE_WITHOUT_CURRENCY`. El body es el
	 * request real de V2 con la ÚNICA variación `currencyId` (la arma el spec).
	 * Fixed assertions:
	 *  - HTTP 409
	 *  - errorCode RATE_WITHOUT_CURRENCY
	 */
	@atc('TM-1423', { description: 'simulateAll — 409 RATE_WITHOUT_CURRENCY con moneda ajena al árbol del pasajero' })
	async simulateAllRejectsCurrencyWithoutRate(carrierId: number, body: TravelRequestBody): Promise<APIResponse> {
		const res = await this.api.postJson(`carriers/${carrierId}/travels/simulateAll`, body);
		const text = await res.text();
		expect(res.status(), `simulateAll -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(409);
		const json = await readJsonSafe<ControlledErrorBody>(res);
		expect(json?.errorCode, `simulateAll errorCode (cuerpo: ${text.slice(0, 300)})`).toBe('RATE_WITHOUT_CURRENCY');
		return res;
	}

	/**
	 * ATC (contrato de API, TM-1390 · MG-1004): reenvía el request real de V2 a simulate/simulateAll/create con
	 * un `currencyId` inexistente o con texto. Oráculo CONSERVADOR (Dev, 20/10/2026: no hay camino de pantalla,
	 * contrato-api): nunca 5xx y siempre un 4xx; el status/errorCode exactos se registran como «comportamiento
	 * observado», no como criterio. Si el backend respondiera 2xx con un viaje, se cancela antes de fallar.
	 * Fixed assertions:
	 *  - HTTP 4xx (nunca 5xx)
	 */
	@atc('TM-1390', { description: 'currencyId inexistente o con texto — error controlado, nunca 5xx' })
	async sendTravelWithRawCurrencyId(
		carrierId: number,
		args: { endpoint: TravelRequestEndpoint; body: TravelRequestBody; currencyId: unknown }
	): Promise<APIResponse> {
		const path = args.endpoint === 'create' ? 'travels' : `travels/${args.endpoint}`;
		const res = await this.api.postJson(`carriers/${carrierId}/${path}`, { ...args.body, currencyId: args.currencyId });
		const text = await res.text();
		if (res.status() < 300 && args.endpoint === 'create') {
			const created = await readJsonSafe<{ travelId?: number }>(res);
			if (created?.travelId !== undefined) await this.cancelTravel(carrierId, created.travelId);
		}
		expect(res.status(), `${args.endpoint} -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBeGreaterThanOrEqual(400);
		expect(res.status(), `${args.endpoint} no debe responder 5xx: ${text.slice(0, 300)}`).toBeLessThan(500);
		return res;
	}

	/**
	 * ATC (contrato de API, TM-1370 · MG-1007-AC2): reenvía el create real de V2 con tarifador por costo y
	 * UNA variación, `paymentMethod` (Efectivo). Dev confirmó el 20/10/2026: el backend NO debe rechazar y
	 * marca el viaje como por venta. Escribe 1 viaje (el spec lo cancela en afterEach).
	 * Fixed assertions:
	 *  - HTTP 200
	 *  - respuesta con travelId
	 */
	@atc('TM-1370', {
		description: 'create con paymentMethod fuera de pantalla y tarifador por costo — 200, viaje por venta'
	})
	async createWithPaymentMethodOverride(
		carrierId: number,
		args: { body: TravelRequestBody; paymentMethod: string }
	): Promise<APIResponse> {
		const res = await this.api.postJson(`carriers/${carrierId}/travels`, {
			...args.body,
			paymentMethod: args.paymentMethod
		});
		const text = await res.text();
		expect(res.status(), `create ${args.paymentMethod} -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(200);
		const created = await readJsonSafe<{ travelId?: number }>(res);
		expect(created?.travelId, 'create debe devolver travelId').toBeDefined();
		return res;
	}

	/**
	 * ATC (contrato de API, TM-1367 · MG-1004-AC2): simulate / simulateAll / create con el request real de V2 SIN
	 * `currencyId` (`'omit'`: la clave no viaja), con `null` o con un número explícito (TM-1424 comparte este ATC:
	 * misma acción, otra partición). El backend debe tomar la moneda del carrier y responder 200; los importes y la
	 * moneda los compara el spec contra el baseline vivo. En `create` el `travelId` se informa por `onCreated` apenas
	 * llega la respuesta, ANTES de asertar, para que el spec pueda cancelar aun si una aserción falla.
	 * Fixed assertions:
	 *  - HTTP 200
	 *  - sin errorCode en el cuerpo
	 *  - shape válido: simulate = objeto con rateId y currency; simulateAll = lista no vacía; create = travelId
	 */
	@atc('TM-1367', { description: 'alta/cotización sin currencyId (u omitido/null/explícito) — moneda del carrier' })
	async sendTravelWithCarrierCurrency(
		carrierId: number,
		args: {
			endpoint: TravelRequestEndpoint;
			body: TravelRequestBody;
			currencyId: CurrencyIdVariant;
			onCreated?: (travelId: number) => void;
		}
	): Promise<APIResponse> {
		const body: TravelRequestBody = { ...args.body };
		delete body.currencyId;
		if (args.currencyId !== 'omit') body.currencyId = args.currencyId;
		const path = args.endpoint === 'create' ? 'travels' : `travels/${args.endpoint}`;
		const res = await this.api.postJson(`carriers/${carrierId}/${path}`, body);
		const text = await res.text();
		const label = `${args.endpoint} currencyId=${args.currencyId === 'omit' ? '(omitido)' : String(args.currencyId)}`;
		const json = await readJsonSafe<unknown>(res);
		if (args.endpoint === 'create') {
			const travelId = (json as { travelId?: number } | null)?.travelId;
			if (typeof travelId === 'number') args.onCreated?.(travelId);
		}
		expect(res.status(), `${label} -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(200);
		expect((json as ControlledErrorBody | null)?.errorCode, `${label} no debe traer errorCode`).toBeUndefined();
		if (args.endpoint === 'simulate') {
			const one = json as SimulationBreakdown;
			expect(typeof one?.rateId, `${label}: simulate debe traer rateId`).toBe('number');
			expect(typeof one?.currency?.currencyId, `${label}: simulate debe traer currency.currencyId`).toBe('number');
		} else if (args.endpoint === 'simulateAll') {
			expect(Array.isArray(json) && json.length > 0, `${label}: simulateAll debe devolver una lista no vacía`).toBe(
				true
			);
		} else {
			expect(typeof (json as { travelId?: number } | null)?.travelId, `${label}: create debe devolver travelId`).toBe(
				'number'
			);
		}
		return res;
	}

	/**
	 * ATC (contrato de API, TM-1426 · MG-1004-AC3): el mismo request enviado a simulate y a simulateAll devuelve el
	 * mismo desglose para el mismo tarifador. simulate devuelve un objeto y simulateAll una lista por tipo de
	 * vehículo: se empareja por `transportTypeId` = `vehicleTypeId` del request. Además, los cuatro campos de costo
	 * nuevos de simulate deben venir informados en 0 (no ausentes).
	 * Fixed assertions:
	 *  - HTTP 200 en los dos endpoints
	 *  - simulateAll trae un elemento para el tipo de vehículo del request
	 *  - rateId, carrierRateByCost, currency, pricePointToPoint, pricePointToPointCost y totalCostPrice iguales
	 *  - waitTotalPriceCost, taxiingCostPriceCost, fixConceptsCost y taxesCost presentes y = 0 en simulate
	 */
	@atc('TM-1426', { description: 'simulate devuelve el mismo desglose que simulateAll (tarifador de venta)' })
	async simulateReturnsSameBreakdownAsSimulateAll(
		carrierId: number,
		body: TravelRequestBody
	): Promise<SimulationParity> {
		const simRes = await this.api.postJson(`carriers/${carrierId}/travels/simulate`, body);
		const simText = await simRes.text();
		expect(simRes.status(), `simulate -> HTTP ${simRes.status()}: ${simText.slice(0, 300)}`).toBe(200);
		// Regla de la campaña: >= 4 s entre llamadas al backend TEST (también entre las dos del par).
		markCallDone();
		await pace();
		const allRes = await this.api.postJson(`carriers/${carrierId}/travels/simulateAll`, body);
		const allText = await allRes.text();
		expect(allRes.status(), `simulateAll -> HTTP ${allRes.status()}: ${allText.slice(0, 300)}`).toBe(200);
		const simulate = await readJsonSafe<SimulationBreakdown>(simRes);
		const simulateAll = await readJsonSafe<SimulationBreakdown[]>(allRes);
		expect(Array.isArray(simulateAll), 'simulateAll debe responder una lista').toBe(true);
		const paired = (simulateAll ?? []).find((s) => s.transportTypeId === body.vehicleTypeId);
		expect(
			paired,
			`simulateAll debe traer el tipo de vehículo ${String(body.vehicleTypeId)} del request`
		).toBeDefined();
		expect(simulate, 'simulate debe traer un cuerpo').not.toBeNull();
		const s = simulate as SimulationBreakdown;
		const p = paired as SimulationBreakdown;
		expect(s.rateId, 'rateId').toBe(p.rateId);
		expect(s.carrierRateByCost, 'carrierRateByCost').toBe(p.carrierRateByCost);
		expect(s.currency, 'currency').toEqual(p.currency);
		expect(s.pricePointToPoint, 'pricePointToPoint').toBe(p.pricePointToPoint);
		expect(s.pricePointToPointCost, 'pricePointToPointCost').toBe(p.pricePointToPointCost);
		expect(s.totalCostPrice, 'totalCostPrice').toBe(p.totalCostPrice);
		for (const field of ['waitTotalPriceCost', 'taxiingCostPriceCost', 'fixConceptsCost', 'taxesCost'] as const) {
			expect(s[field], `simulate.${field} debe venir informado en 0, no ausente`).toBe(0);
		}
		return { simulate: s, simulateAll: simulateAll as SimulationBreakdown[], paired: p };
	}

	/**
	 * ATC (contrato de API, TM-1426 · MG-1004): simulate con una moneda que ningún tarifador del árbol del pasajero
	 * factura se rechaza con 409 controlado `RATE_WITHOUT_CURRENCY`. Análogo a `simulateAllRejectsCurrencyWithoutRate`
	 * (TM-1423): se separa porque cambia el endpoint y no se parametriza el ATC ya publicado.
	 * Fixed assertions:
	 *  - HTTP 409
	 *  - errorCode RATE_WITHOUT_CURRENCY
	 */
	@atc('TM-1426', { description: 'simulate — 409 RATE_WITHOUT_CURRENCY con moneda ajena al árbol del pasajero' })
	async simulateRejectsCurrencyWithoutRate(carrierId: number, body: TravelRequestBody): Promise<APIResponse> {
		const res = await this.api.postJson(`carriers/${carrierId}/travels/simulate`, body);
		const text = await res.text();
		expect(res.status(), `simulate -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(409);
		const json = await readJsonSafe<ControlledErrorBody>(res);
		expect(json?.errorCode, `simulate errorCode (cuerpo: ${text.slice(0, 300)})`).toBe('RATE_WITHOUT_CURRENCY');
		return res;
	}

	/**
	 * ATC (contrato de API, TM-1395 · MG-1004; TM-1431 comparte la acción): alta real de un empleado de contractor
	 * (sin cuenta propia, o con registro propio) para que el backend resuelva el tarifador PERSONALIZED del contractor.
	 * Escribe 1 viaje; el `travelId` se informa por `onCreated` antes de asertar, para que el spec lo cancele. El
	 * tarifador y los importes los verifica el spec en DB (SIMULATIONPRICEI).
	 * Fixed assertions:
	 *  - HTTP 200
	 *  - respuesta con travelId
	 */
	@atc('TM-1395', { description: 'create de empleado de contractor — resuelve el tarifador del contractor' })
	async createResolvingContractorRate(
		carrierId: number,
		args: { body: TravelRequestBody; onCreated?: (travelId: number) => void }
	): Promise<APIResponse> {
		const res = await this.api.postJson(`carriers/${carrierId}/travels`, args.body);
		const text = await res.text();
		const created = await readJsonSafe<{ travelId?: number }>(res);
		if (typeof created?.travelId === 'number') args.onCreated?.(created.travelId);
		expect(res.status(), `create -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(200);
		expect(created?.travelId, 'create debe devolver travelId').toBeDefined();
		return res;
	}

	/**
	 * ATC (contrato de API, TM-1394 · MG-1004): `checkExceedingLimit` evalúa la cuenta corriente del pasajero que se
	 * le pasa: `passengerId` debe ser el SOLICITANTE (contractor, `CONTRACTORACCOUNT.PASSENGER_ID`) dueño de la
	 * PASSENGERACCOUNT del carrier; con un pasajero sin cuenta en el carrier (p. ej. el empleado) el backend responde
	 * NOT_EXCEEDED sin evaluar saldo. El GET no lleva importe; `currencyId` es opcional (query) y por defecto es la
	 * moneda predeterminada del carrier. El valor esperado según saldo/límite lo establece el spec (preparado en
	 * DB/ContractorAccountApi).
	 * Fixed assertions:
	 *  - HTTP 200
	 *  - valor ∈ {EXCEEDED, NOT_EXCEEDED, ALLOWED_TO_EXCEED}
	 */
	@atc('TM-1394', { description: 'checkExceedingLimit — saldo disponible de la cuenta corriente' })
	async checkExceedingLimit(carrierId: number, args: { passengerId: number }): Promise<ExceedingLimitStatus> {
		const res = await this.api.getJson(
			`carriers/${carrierId}/travels/passenger/${args.passengerId}/checkExceedingLimit/CHECKING_ACCOUNT/Web`
		);
		const text = await res.text();
		expect(res.status(), `checkExceedingLimit -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(200);
		const value = (await readJsonSafe<string>(res)) ?? text.replace(/"/g, '');
		expect(['EXCEEDED', 'NOT_EXCEEDED', 'ALLOWED_TO_EXCEED'], `checkExceedingLimit devolvió «${value}»`).toContain(
			value
		);
		return value as ExceedingLimitStatus;
	}

	/**
	 * Acción de soporte — PÚBLICA pero SIN decorar (NO es un ATC de ningún Test de Xray): cotiza con simulate o
	 * simulateAll el request real de V2 y devuelve la respuesta cruda. La usan los specs que necesitan el importe de
	 * la cotización como paso de un caso cuyo ATC es otro (p. ej. TM-1395/TM-1431: simulate y simulateAll antes del
	 * alta) o como `I` del límite de CC (TM-1394). No asierta: el spec decide.
	 */
	async requestSimulation(
		carrierId: number,
		args: { endpoint: 'simulate' | 'simulateAll'; body: TravelRequestBody }
	): Promise<APIResponse> {
		return this.api.postJson(`carriers/${carrierId}/travels/${args.endpoint}`, args.body);
	}

	/**
	 * Acción de limpieza — PÚBLICA pero SIN decorar (NO es un ATC de ningún Test de Xray): cancela
	 * el viaje dado de alta por createTravelWithRouteFlag/updateTravelWithRouteFlag para no dejar
	 * viajes de prueba acumulándose en el entorno. Cancelar no es la acción bajo prueba de TM-945
	 * (verificar que el flag de ruta persiste bien) y decorarla acreditaría evidencia falsa a ese
	 * Test — mismo patrón que FrequentDestinationApi.updateWithRouteFlags (acción compartida sin
	 * @atc).
	 *
	 * Contrato real de `CancelTravelRequestDTO` (backend; openapi.yaml NO lo refleja y publica
	 * `properties: {}` porque el generador no vio 6 campos package-private):
	 * `reasonForCancellation`, `canceledBy` (MagiisRole), `name`, `checkPassengerCancelation`,
	 * `userId`, `carrierId`.
	 *  - `canceledBy` es obligatorio de hecho: `CancelRolesUtils.getUserTypesByRole` hace `switch`
	 *    sobre él; con null -> NPE -> 400 ACTION_NOT_ALLOWED.
	 *  - `reasonForCancellation` debe ser no vacío (con '' el backend responde 500).
	 *  - `userId` / `name` son opcionales (rama CARRIER); se envían solo si existen las env
	 *    MAGIIS_TEST_CARRIER_USER_ID / MAGIIS_TEST_CARRIER_NAME.
	 * Fixed assertions:
	 *  - HTTP 200
	 */
	async cancelTravel(carrierId: number, travelId: number): Promise<APIResponse> {
		const body: Record<string, unknown> = {
			canceledBy: 'CARRIER',
			reasonForCancellation: 'QA automation cleanup (TM-945)',
			checkPassengerCancelation: false,
			carrierId
		};
		const userId = process.env.MAGIIS_TEST_CARRIER_USER_ID;
		if (userId && Number.isFinite(Number(userId))) body.userId = Number(userId);
		const name = process.env.MAGIIS_TEST_CARRIER_NAME;
		if (name) body.name = name;
		const res = await this.api.putJson(`carriers/${carrierId}/travels/${travelId}/cancel`, body);
		const text = await res.text();
		expect(
			res.status(),
			`PUT carriers/${carrierId}/travels/${travelId}/cancel -> HTTP ${res.status()}: ${text.slice(0, 300)}`
		).toBe(200);
		return res;
	}

	/**
	 * Acción de soporte — PÚBLICA pero SIN decorar (NO es un ATC: no es la acción bajo prueba de
	 * ningún Test de Xray). Oráculo de TM-937 (`/travels/budget` no devuelve geometría): mismo
	 * endpoint que TM-934 pero enviando `fastestRoute` EXPLÍCITO (a diferencia de
	 * `requestTimesOmittingFlagsResolvesAgainstCarrierParameter`, que siempre lo omite), para no
	 * acoplar la evidencia de TM-937 a la resolución de la omisión — eso ya lo prueba TM-934.
	 * Fixed assertions:
	 *  - HTTP 200
	 */
	async requestTimesWithExplicitFastestRoute(
		carrierId: number,
		args: RoutePoints & { fastestRoute: boolean }
	): Promise<APIResponse> {
		const originToken = mg682OriginToken('TM937-ORACLE');
		const res = await this.api.postJson(`carriers/${carrierId}/travels/times`, {
			originToken,
			origin: args.origin,
			destination: args.destination,
			fastestRoute: args.fastestRoute
		});
		expect(res.status()).toBe(200);
		return res;
	}

	/**
	 * Discover: localiza un `passengerUserId` real del carrier (cliente enlazado, `isPassenger:
	 * true`) para usar como `requesterUserId`/`passengerUserId` del alta — mismo endpoint que
	 * `card.api.test.ts` (firstPassengerId), pero acá SÍ filtra por `isPassenger` porque el alta
	 * de viaje necesita un pasajero real, no un contacto administrativo/contractor de la lista
	 * (confirmado en vivo: el primer cliente de `carriers/1521/clients` es un contractor
	 * `isPassenger:false`). Silent fail (utilidad, no ATC): devuelve `null` si el carrier no tiene
	 * ningún cliente marcado como pasajero; el spec decide si skipea.
	 */
	@step
	async findRequesterUserId(carrierId: number): Promise<number | null> {
		const res = await this.api.getJson(`carriers/${carrierId}/clients`);
		if (res.status() !== 200) return null;
		const list = await readJsonSafe<Array<{ passengerUserId?: number; isPassenger?: boolean }>>(res);
		if (!Array.isArray(list)) return null;
		const passenger = list.find((c) => c.isPassenger === true && typeof c.passengerUserId === 'number');
		const fallback = list.find((c) => typeof c.passengerUserId === 'number');
		return (passenger ?? fallback)?.passengerUserId ?? null;
	}

	/**
	 * Body compartido de `TravelCreateRequestDTO` — usado por createTravelWithRouteFlag,
	 * simulateTravelWithRouteFlag y simulateAllTravelWithRouteFlag (mismo DTO, ver openapi.yaml).
	 * PRIVADO: no es un ATC ni un Discover, es construcción de payload.
	 */
	private buildTravelCreateBody(args: CreateTravelArgs, originTokenSuffix: string): Record<string, unknown> {
		const body: Record<string, unknown> = {
			originToken: mg682OriginToken(originTokenSuffix),
			origin: args.origin,
			destination: args.destination,
			requesterUserId: args.requesterUserId,
			// Ver nota de CreateTravelArgs: sin passengerUserId el backend responde 404 (id null).
			passengerUserId: args.requesterUserId,
			paymentMethod: 'CASH',
			platform: 'Web',
			travelPreferences: { airConditioner: false, luggage: false, mascots: false }
		};
		if (args.pickupGmt !== undefined) body.pickupGmt = args.pickupGmt;
		this.applyRouteFlags(body, args);
		return body;
	}

	/**
	 * Aplica los tres flags opcionales de ruta a un body ya construido — la clave se omite del
	 * JSON si el valor es `undefined`. Compartido por los cuatro ATCs de alta/simulación/edición.
	 */
	private applyRouteFlags(body: Record<string, unknown>, flags: RouteFlagsArgs): void {
		if (flags.avoidTolls !== undefined) body.avoidTolls = flags.avoidTolls;
		if (flags.avoidHighways !== undefined) body.avoidHighways = flags.avoidHighways;
		if (flags.fastestRoute !== undefined) body.fastestRoute = flags.fastestRoute;
	}
}
