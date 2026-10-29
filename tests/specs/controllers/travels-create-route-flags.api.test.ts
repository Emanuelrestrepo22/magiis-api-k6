// tests/specs/controllers/travels-create-route-flags.api.test.ts
// TM-945 (TC16, Xray TM) — BUG-MG-682: matriz completa de endpoints que aceptan `fastestRoute` en
// el payload de un viaje (alta real, simulate, simulateAll, update). Aserción central en todos:
// FASTEST_ROUTE nunca queda NULL; OMITIDO resuelve contra PARAMETERS del carrier, EXPLÍCITO
// persiste tal cual se envía (incluso si contradice PARAMETERS) — sin importar el endpoint.
// Componente: TravelsApi.
//
// Filas de la matriz completa del TC16 (la fila 7 queda documentada FUERA, ver describe final):
//   1. POST .../travels                  omitido                          → solo carrier con PARAMETERS.FASTEST_ROUTE=true (skip si no hay uno accesible)
//   2. POST .../travels                  explícito contrario al parámetro → mg682Data().carrierId
//   3. POST .../travels/simulate         omitido                          → mg682Data().carrierId
//   4. POST .../travels/simulate         explícito contrario al parámetro → mg682Data().carrierId
//   5. POST .../travels/simulateAll      omitido                          → mg682Data().carrierId
//   6. PUT .../travels/{travelId}/update omitido                          → mg682Data().carrierId (crea el viaje primero con el flag EXPLÍCITO CONTRARIO como semilla, para probar que el UPDATE re-resuelve la omisión de forma independiente del alta — no que simplemente preserva lo que ya tenía)
//   7. POST /quotes/simulate             omitido                          → FUERA (deprecated, no produce Travel — ver el describe final)
//
// Limpieza: toda fila que da de alta un viaje (1, 2, 6) lo cancela en un afterEach que corre aunque
// el test falle (travels.cancelTravel, con el body real del DTO — no `{}`) y anota el travelId (tipo travel-created) para que el
// orquestador pueda auditarlo. Las filas de simulate/simulateAll (3, 4, 5) NO dan de alta viaje →
// no necesitan limpieza.
//
// Pata DB (OBLIGATORIA para verificar el flag): con `db`, TRAVEL para las filas de alta/update
// (1, 2, 6) y MAGIIS_ROUTES para las de simulate/simulateAll (3, 4, 5). Ninguna de las respuestas
// (alta, simulate, simulateAll, update) expone FASTEST_ROUTE — no hay oráculo API alternativo, así
// que sin `db` el caso SKIPEA con motivo explícito en vez de asertar algo no relacionado con
// TM-945 y reportar PASSED en falso.
//
// Esperado leído en vivo con carrierParameters.readRouteFlagParameters (flagBit) — nunca
// hardcodeado.
//
// NOTA: la versión anterior de este archivo documentaba "no existe endpoint de cancelación
// verificado" — eso ya no es cierto: `PUT carriers/{carrierId}/travels/{travelId}/cancel` está
// verificado y se usa en el afterEach de abajo. OJO: openapi.yaml publica `CancelTravelRequestDTO`
// como `{}` pero el backend exige `canceledBy` (si no, 400 ACTION_NOT_ALLOWED) y un
// `reasonForCancellation` no vacío — el body real vive en TravelsApi.cancelTravel.

import { test, expect } from '@TestBase';
import { mg682Data } from '@data/mg682';
import { flagBit } from '@components/api/CarrierParametersApi';
import { readRouteRow } from '@components/db/routeRowOracle';

interface TravelCleanupState {
	carrierId: number;
	travelId: number;
}

/**
 * Registra el `afterEach` que cancela el viaje dado de alta durante el test (corre aunque el test
 * falle). Si el test skipea antes de dar de alta ningún viaje, el estado queda `null` y el
 * afterEach no hace nada. Mismo patrón que `registerRouteFlagsRestore` en
 * frequent-destination-explicit-flags.api.test.ts.
 */
function registerTravelCleanup(): (state: TravelCleanupState) => void {
	let state: TravelCleanupState | null = null;
	test.afterEach(async ({ travels }) => {
		if (!state) return;
		await travels.cancelTravel(state.carrierId, state.travelId);
		state = null;
	});
	return (next) => {
		state = next;
	};
}

// ─── Filas 1 y 2 — POST /travels (alta real) ────────────────────────────────────────────────────

test.describe('TravelController — TM-945: alta real, flags de ruta contra el parámetro del carrier (POST /travels)', () => {
	const setCleanup = registerTravelCleanup();

	test('TM-945: debería resolver FASTEST_ROUTE contra PARAMETERS.FASTEST_ROUTE=true cuando el alta (POST /travels) lo omite', async ({
		travels,
		carrierParameters,
		db
	}) => {
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

		const requesterUserId = await travels.findRequesterUserId(carrierId);
		test.skip(
			requesterUserId == null,
			`TM-945: carrier ${carrierId} sin passengerUserId enlazado (carriers/${carrierId}/clients vacío) — no hay requesterUserId real para el alta.`
		);

		const res = await travels.createTravelWithRouteFlag(carrierId, {
			origin: route.origin,
			destination: route.destination,
			requesterUserId: requesterUserId!
			// fastestRoute omitido a propósito — variante bajo prueba de esta fila.
		});
		const body = (await res.json()) as { travelId?: number };
		expect(body.travelId, 'el alta debe devolver el travelId del viaje creado').toBeDefined();
		const travelId = body.travelId!;
		setCleanup({ carrierId, travelId });
		test
			.info()
			.annotations.push({ type: 'travel-created', description: `carrier ${carrierId} · travelId ${travelId}` });

		test.skip(
			!db,
			`Sin credenciales Oracle (ver ORACLE_* en .env.<env>): TRAVEL.FASTEST_ROUTE no es verificable — POST /travels no expone el flag en la respuesta, no hay oráculo API alternativo para TM-945.`
		);

		const dbRows = await db!.query<{ FASTEST_ROUTE: number; AVOIDTOLLS: number; AVOIDHIGHWAYS: number }>(
			'SELECT FASTEST_ROUTE, AVOIDTOLLS, AVOIDHIGHWAYS FROM TRAVEL WHERE ID = :id',
			{ id: travelId }
		);
		expect(dbRows).toHaveLength(1);
		expect(dbRows[0].FASTEST_ROUTE, `FASTEST_ROUTE debe venir del parámetro del carrier ${carrierId}`).toBe(
			flagBit(params!, 'fastestRoute')
		);
		expect(dbRows[0].AVOIDTOLLS, 'AVOIDTOLLS nunca debe quedar NULL').not.toBeNull();
		expect(dbRows[0].AVOIDHIGHWAYS, 'AVOIDHIGHWAYS nunca debe quedar NULL').not.toBeNull();
	});

	test('TM-945: debería persistir FASTEST_ROUTE explícito (contrario al parámetro) cuando el alta (POST /travels) lo envía', async ({
		travels,
		carrierParameters,
		db
	}) => {
		const { carrierId, route } = mg682Data();

		const params = await carrierParameters.readRouteFlagParameters(carrierId);
		test.skip(
			!params,
			`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
		);

		const requesterUserId = await travels.findRequesterUserId(carrierId);
		test.skip(
			requesterUserId == null,
			`TM-945: carrier ${carrierId} sin passengerUserId enlazado (carriers/${carrierId}/clients vacío) — no hay requesterUserId real para el alta.`
		);

		const explicitValue = !params!.fastestRoute;

		const res = await travels.createTravelWithRouteFlag(carrierId, {
			origin: route.origin,
			destination: route.destination,
			requesterUserId: requesterUserId!,
			fastestRoute: explicitValue
		});
		const body = (await res.json()) as { travelId?: number };
		expect(body.travelId, 'el alta debe devolver el travelId del viaje creado').toBeDefined();
		const travelId = body.travelId!;
		setCleanup({ carrierId, travelId });
		test
			.info()
			.annotations.push({ type: 'travel-created', description: `carrier ${carrierId} · travelId ${travelId}` });

		test.skip(
			!db,
			`Sin credenciales Oracle (ver ORACLE_* en .env.<env>): TRAVEL.FASTEST_ROUTE no es verificable — POST /travels no expone el flag en la respuesta, no hay oráculo API alternativo para TM-945.`
		);

		const dbRows = await db!.query<{ FASTEST_ROUTE: number; AVOIDTOLLS: number; AVOIDHIGHWAYS: number }>(
			'SELECT FASTEST_ROUTE, AVOIDTOLLS, AVOIDHIGHWAYS FROM TRAVEL WHERE ID = :id',
			{ id: travelId }
		);
		expect(dbRows).toHaveLength(1);
		expect(
			dbRows[0].FASTEST_ROUTE,
			`FASTEST_ROUTE explícito=${explicitValue} (contrario a PARAMETERS.FASTEST_ROUTE=${params!.fastestRoute}) no debe aplanarse contra el parámetro`
		).toBe(explicitValue ? 1 : 0);
		expect(dbRows[0].AVOIDTOLLS, 'AVOIDTOLLS nunca debe quedar NULL').not.toBeNull();
		expect(dbRows[0].AVOIDHIGHWAYS, 'AVOIDHIGHWAYS nunca debe quedar NULL').not.toBeNull();
	});
});

// ─── Filas 3, 4 y 5 — travels/simulate y travels/simulateAll (con `pickupGmt`) ────────────────────
// Regla de negocio: el GMT del viaje (`pickupGmt`) es SIEMPRE la zona horaria de la dirección de recogida; el
// front la deriva de las coordenadas del origen (tzlookup lat/lng). Omitirlo es input inválido (el backend
// responde 400 {"description":"zoneId"}), por eso todas las filas de simulate/simulateAll lo envían.
// Valor: la ruta de mg682Data() es Buenos Aires y el front envía 'America/Argentina/Buenos_Aires'.
const PICKUP_GMT_ORIGIN_BA = 'America/Argentina/Buenos_Aires';

test.describe('TravelController — TM-945: simulate/simulateAll, flags de ruta contra el parámetro del carrier (pickupGmt = zona horaria del origen)', () => {
	test('TM-945: debería resolver FASTEST_ROUTE contra el parámetro del carrier cuando /travels/simulate lo omite y envía pickupGmt', async ({
		travels,
		carrierParameters,
		db
	}, testInfo) => {
		const { carrierId, route } = mg682Data();

		const params = await carrierParameters.readRouteFlagParameters(carrierId);
		test.skip(
			!params,
			`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
		);
		const requesterUserId = await travels.findRequesterUserId(carrierId);
		test.skip(
			requesterUserId == null,
			`TM-945: carrier ${carrierId} sin passengerUserId enlazado (carriers/${carrierId}/clients vacío) — no hay requesterUserId real.`
		);

		test.skip(
			!db,
			`Sin credenciales Oracle (ver ORACLE_* en .env.<env>): MAGIIS_ROUTES.FASTEST_ROUTE no es verificable — /travels/simulate no expone el flag en la respuesta, no hay oráculo API alternativo para TM-945.`
		);

		const flagValues = {
			avoidHighways: flagBit(params!, 'avoidHighways'),
			avoidTolls: flagBit(params!, 'avoidTolls'),
			fastestRoute: flagBit(params!, 'fastestRoute')
		};
		const before = await readRouteRow(db!, route, flagValues);

		const res = await travels.simulateTravelWithRouteFlag(carrierId, {
			origin: route.origin,
			destination: route.destination,
			requesterUserId: requesterUserId!,
			pickupGmt: PICKUP_GMT_ORIGIN_BA
			// fastestRoute omitido a propósito — variante bajo prueba de esta fila.
		});

		await testInfo.attach('tm945-simulate-pickupgmt-omitted.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{
					endpoint: '/travels/simulate',
					carrierId,
					requestFlags: { fastestRoute: 'omitted', avoidTolls: 'omitted', avoidHighways: 'omitted' },
					pickupGmt: PICKUP_GMT_ORIGIN_BA,
					carrierParameterFastestRoute: params!.fastestRoute,
					responseStatus: res.status()
				},
				null,
				2
			)
		});

		const after = await readRouteRow(db!, route, flagValues);
		expect(
			after,
			`ninguna fila de MAGIIS_ROUTES coincide con la combinación de flags esperada tras el request — ` +
				`fastestRoute no resolvió contra PARAMETERS como debía`
		).not.toBeNull();
		await testInfo.attach('tm945-simulate-pickupgmt-omitted-resolved.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{
					routeRowId: after!.ID,
					resolvedFastestRoute: flagValues.fastestRoute,
					used: { before: before?.USED ?? null, after: after!.USED }
				},
				null,
				2
			)
		});
		expect(
			after!.USED ?? 0,
			`la fila (ID ${after!.ID}) existe pero su contador USED no subió respecto del snapshot previo a este ` +
				`request (before=${before?.USED ?? 'sin fila'}, after=${after!.USED}): esta ejecución no la tocó, ` +
				`el verde no le sería atribuible`
		).toBeGreaterThan(before?.USED ?? 0);
	});

	test('TM-945: debería persistir FASTEST_ROUTE explícito (contrario al parámetro) cuando /travels/simulate lo envía junto con pickupGmt', async ({
		travels,
		carrierParameters,
		db
	}, testInfo) => {
		const { carrierId, route } = mg682Data();

		const params = await carrierParameters.readRouteFlagParameters(carrierId);
		test.skip(
			!params,
			`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
		);
		const requesterUserId = await travels.findRequesterUserId(carrierId);
		test.skip(
			requesterUserId == null,
			`TM-945: carrier ${carrierId} sin passengerUserId enlazado (carriers/${carrierId}/clients vacío) — no hay requesterUserId real.`
		);

		const explicitValue = !params!.fastestRoute;

		test.skip(
			!db,
			`Sin credenciales Oracle (ver ORACLE_* en .env.<env>): MAGIIS_ROUTES.FASTEST_ROUTE no es verificable — /travels/simulate no expone el flag en la respuesta, no hay oráculo API alternativo para TM-945.`
		);

		const flagValues = {
			avoidHighways: flagBit(params!, 'avoidHighways'),
			avoidTolls: flagBit(params!, 'avoidTolls'),
			fastestRoute: explicitValue ? 1 : 0
		};
		const before = await readRouteRow(db!, route, flagValues);

		const res = await travels.simulateTravelWithRouteFlag(carrierId, {
			origin: route.origin,
			destination: route.destination,
			requesterUserId: requesterUserId!,
			pickupGmt: PICKUP_GMT_ORIGIN_BA,
			fastestRoute: explicitValue
		});

		await testInfo.attach('tm945-simulate-pickupgmt-explicit.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{
					endpoint: '/travels/simulate',
					carrierId,
					requestFlags: { fastestRoute: explicitValue, avoidTolls: 'omitted', avoidHighways: 'omitted' },
					pickupGmt: PICKUP_GMT_ORIGIN_BA,
					carrierParameterFastestRoute: params!.fastestRoute,
					responseStatus: res.status()
				},
				null,
				2
			)
		});

		const after = await readRouteRow(db!, route, flagValues);
		expect(
			after,
			`ninguna fila de MAGIIS_ROUTES coincide con la combinación de flags esperada tras el request — ` +
				`FASTEST_ROUTE explícito=${explicitValue} (contrario a PARAMETERS.FASTEST_ROUTE=${params!.fastestRoute}) no debe aplanarse`
		).not.toBeNull();
		await testInfo.attach('tm945-simulate-pickupgmt-explicit-resolved.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{
					routeRowId: after!.ID,
					resolvedFastestRoute: flagValues.fastestRoute,
					used: { before: before?.USED ?? null, after: after!.USED }
				},
				null,
				2
			)
		});
		expect(
			after!.USED ?? 0,
			`la fila (ID ${after!.ID}) existe pero su contador USED no subió respecto del snapshot previo a este ` +
				`request (before=${before?.USED ?? 'sin fila'}, after=${after!.USED}): esta ejecución no la tocó, ` +
				`el verde no le sería atribuible`
		).toBeGreaterThan(before?.USED ?? 0);
	});

	test('TM-945: debería devolver un array no vacío y resolver FASTEST_ROUTE contra el parámetro del carrier cuando /travels/simulateAll lo omite y envía pickupGmt', async ({
		travels,
		carrierParameters,
		db
	}, testInfo) => {
		const { carrierId, route } = mg682Data();

		const params = await carrierParameters.readRouteFlagParameters(carrierId);
		test.skip(
			!params,
			`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
		);
		const requesterUserId = await travels.findRequesterUserId(carrierId);
		test.skip(
			requesterUserId == null,
			`TM-945: carrier ${carrierId} sin passengerUserId enlazado (carriers/${carrierId}/clients vacío) — no hay requesterUserId real.`
		);

		test.skip(
			!db,
			`Sin credenciales Oracle (ver ORACLE_* en .env.<env>): MAGIIS_ROUTES.FASTEST_ROUTE no es verificable — /travels/simulateAll no expone el flag en la respuesta, no hay oráculo API alternativo para TM-945.`
		);

		const flagValues = {
			avoidHighways: flagBit(params!, 'avoidHighways'),
			avoidTolls: flagBit(params!, 'avoidTolls'),
			fastestRoute: flagBit(params!, 'fastestRoute')
		};
		const before = await readRouteRow(db!, route, flagValues);

		const res = await travels.simulateAllTravelWithRouteFlag(carrierId, {
			origin: route.origin,
			destination: route.destination,
			requesterUserId: requesterUserId!,
			pickupGmt: PICKUP_GMT_ORIGIN_BA
			// fastestRoute omitido a propósito — variante bajo prueba de esta fila.
		});
		const arr = (await res.json()) as unknown[];
		expect(Array.isArray(arr) && arr.length > 0, 'simulateAll debe devolver un array no vacío').toBe(true);

		await testInfo.attach('tm945-simulateAll-pickupgmt-omitted.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{
					endpoint: '/travels/simulateAll',
					carrierId,
					requestFlags: { fastestRoute: 'omitted', avoidTolls: 'omitted', avoidHighways: 'omitted' },
					pickupGmt: PICKUP_GMT_ORIGIN_BA,
					carrierParameterFastestRoute: params!.fastestRoute,
					responseStatus: res.status()
				},
				null,
				2
			)
		});

		const after = await readRouteRow(db!, route, flagValues);
		expect(
			after,
			`ninguna fila de MAGIIS_ROUTES coincide con la combinación de flags esperada tras el request — ` +
				`fastestRoute no resolvió contra PARAMETERS como debía`
		).not.toBeNull();
		await testInfo.attach('tm945-simulateAll-pickupgmt-omitted-resolved.json', {
			contentType: 'application/json',
			body: JSON.stringify(
				{
					routeRowId: after!.ID,
					resolvedFastestRoute: flagValues.fastestRoute,
					used: { before: before?.USED ?? null, after: after!.USED }
				},
				null,
				2
			)
		});
		expect(
			after!.USED ?? 0,
			`la fila (ID ${after!.ID}) existe pero su contador USED no subió respecto del snapshot previo a este ` +
				`request (before=${before?.USED ?? 'sin fila'}, after=${after!.USED}): esta ejecución no la tocó, ` +
				`el verde no le sería atribuible`
		).toBeGreaterThan(before?.USED ?? 0);
	});
});

// ─── Fila 6 — PUT /travels/{travelId}/update ────────────────────────────────────────────────────

test.describe('TravelController — TM-945: edición de viaje (PUT /travels/{travelId}/update)', () => {
	const setCleanup = registerTravelCleanup();

	test('TM-945: debería resolver FASTEST_ROUTE contra el parámetro del carrier cuando PUT /travels/{travelId}/update lo omite', async ({
		travels,
		carrierParameters,
		db
	}) => {
		const { carrierId, route } = mg682Data();

		const params = await carrierParameters.readRouteFlagParameters(carrierId);
		test.skip(
			!params,
			`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
		);
		const requesterUserId = await travels.findRequesterUserId(carrierId);
		test.skip(
			requesterUserId == null,
			`TM-945: carrier ${carrierId} sin passengerUserId enlazado (carriers/${carrierId}/clients vacío) — no hay requesterUserId real para el alta.`
		);

		// Semilla deliberadamente CONTRARIA al parámetro (ver fila 2: explícito persiste tal cual):
		// si el update no re-resolviera la omisión de forma independiente, la fila pasaría en falso
		// heredando el valor semilla del alta en vez de resolverlo por sí misma.
		const seedValue = !params!.fastestRoute;
		const createRes = await travels.createTravelWithRouteFlag(carrierId, {
			origin: route.origin,
			destination: route.destination,
			requesterUserId: requesterUserId!,
			fastestRoute: seedValue
		});
		const createdBody = (await createRes.json()) as { travelId?: number };
		expect(createdBody.travelId, 'el alta previa al update debe devolver travelId').toBeDefined();
		const travelId = createdBody.travelId!;
		setCleanup({ carrierId, travelId });
		test.info().annotations.push({
			type: 'travel-created',
			description: `carrier ${carrierId} · travelId ${travelId} (semilla fastestRoute=${seedValue}, previa al update)`
		});

		await travels.updateTravelWithRouteFlag(carrierId, {
			travelId,
			origin: route.origin,
			destination: route.destination
			// fastestRoute omitido a propósito — variante bajo prueba de esta fila.
		});

		test.skip(
			!db,
			`Sin credenciales Oracle (ver ORACLE_* en .env.<env>): TRAVEL.FASTEST_ROUTE no es verificable — PUT /travels/{travelId}/update no expone el flag en la respuesta, no hay oráculo API alternativo para TM-945.`
		);

		const dbRows = await db!.query<{ FASTEST_ROUTE: number }>('SELECT FASTEST_ROUTE FROM TRAVEL WHERE ID = :id', {
			id: travelId
		});
		expect(dbRows).toHaveLength(1);
		expect(
			dbRows[0].FASTEST_ROUTE,
			`FASTEST_ROUTE debe re-resolverse contra PARAMETERS del carrier ${carrierId} al editar, aunque el alta lo sembró contrario (${seedValue})`
		).toBe(flagBit(params!, 'fastestRoute'));
	});
});

// ─── Fila 7 — fuera de alcance ───────────────────────────────────────────────────────────────────

test.describe('TravelController — TM-945: fuera de alcance', () => {
	test('TM-945: no verifica POST /quotes/simulate — deprecated y no produce un Travel', async () => {
		test.skip(
			true,
			'POST /quotes/simulate está deprecated (openapi.yaml) y devuelve una cotización (SimulateQuoteResponseDTO), no un Travel — el "Entonces el Travel resultante..." de este caso no tiene sujeto sobre este endpoint.'
		);
	});
});
