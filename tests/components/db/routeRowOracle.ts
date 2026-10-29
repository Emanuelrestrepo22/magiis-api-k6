// tests/components/db/routeRowOracle.ts
// Oráculo compartido de MAGIIS_ROUTES (índice único `UX_MAGIIS_ROUTES_ROUTE_KEY`) para todos los
// specs que verifican un flag de ruta (avoidTolls/avoidHighways/fastestRoute) contra esa tabla.
// Extraído de travels-times.api.test.ts (TM-934) para que travels-create-route-flags.api.test.ts
// (TM-945, filas simulate/simulateAll) deje de usar la query defectuosa
// `WHERE PICKUP_PLACE_ID = :o AND DROPOFF_PLACE_ID = :d ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`
// — sin filtrar por los tres flags, coexisten hasta 8 filas por par origen/destino (una por
// combinación), así que esa query identificaba una fila ARBITRARIA, no la de este request.
//
// Si el índice único cambia, este es el ÚNICO lugar a tocar — evita que las dos suites que
// consultan MAGIIS_ROUTES se desincronicen con dos copias del mismo WHERE.
//
// ORÁCULO — por qué el WHERE lleva los TRES flags (verificado en vivo contra UAT, 2026-09-10):
// el índice único de la tabla es `UX_MAGIIS_ROUTES_ROUTE_KEY (PICKUP_PLACE_ID, DROPOFF_PLACE_ID,
// AVOID_HIGHWAYS, AVOID_TOLLS, FASTEST_ROUTE)` — para un mismo par origen/destino coexisten HASTA
// 8 filas, una por combinación de flags (evidencia: TM-945-simulate-oraculo-diferencial.json, filas
// 894972 FASTEST_ROUTE=0 y 640244 FASTEST_ROUTE=1 para el mismo par). `ORDER BY ID DESC` por sí
// solo NO identifica la fila de esta request: en un cache hit no hay INSERT, así que ni siquiera
// el ID más alto es necesariamente el de esta llamada. Filtrar por los tres flags (leídos en vivo
// de PARAMETERS, igual que `expected`) sí la identifica sin ambigüedad, porque el índice único
// garantiza que como máximo existe UNA fila por combinación completa de flags.
//
// ATRIBUCIÓN A ESTA EJECUCIÓN — por qué el llamador debe leer `USED` antes Y después del request
// (verificado en vivo contra TEST, MAGIIS.MAGIIS_ROUTES, 2026-09-10): la tabla es de acumulación
// SOLO-AGREGADO — nunca borra — así que una fila que cumple el WHERE puede venir de una request
// ANTERIOR (otra corrida, otro carrier, otra sesión) y una simple existencia (`length > 0`) sería
// el mismo patrón de falso verde que ya se corrigió para el valor de columna, en forma más sutil:
// pasaría sin que ESTA ejecución haya escrito nada.
// La columna `USED` ("Cantidad de veces usado", ver DB comment) se incrementa tanto en el INSERT
// (cache miss, primer request de esa combinación) como en cada HIT posterior — confirmado
// consultando la tabla en vivo: filas con `USED` > 1 y sin relación con esta suite (ver
// ID 1704 USED=6, ID 1701 USED=16). Por eso el patrón es: snapshot `before` (fila puede no existir
// todavía) → disparar el request → releer la MISMA fila (`after`, identificada por el índice único
// de los tres flags): si `USED` no subió respecto de `before`, la fila no fue tocada por este
// request — sea porque no existe (bug real: el flag no persistió) o porque otra ejecución la tocó
// pero la nuestra no.
//
// RIESGO RESIDUAL (declarado, no resuelto): si otra sesión de test pega la MISMA combinación
// origen/destino/flags en la MISMA ventana entre el snapshot `before` y la relectura `after`, ese
// incremento ajeno también haría pasar la aserción. No se fuerza un cache-miss dedicado por
// corrida (par de lugares nuevo) porque generarlo de forma confiable requeriría resolver un
// `placeId` real y enrutable en cada corrida (vía Places autocomplete) sin garantía de que el
// backend lo compute como ruta válida — un mecanismo más frágil que la ventana de atribución que
// ya cierra el caso normal. Ver AGUJERO 1 en el reporte de la sesión que agregó este oráculo.

import type { OracleDb } from '@components/db/OracleDb';

export interface RouteRow {
	ID: number;
	USED: number | null;
}

export interface RouteFlagValues {
	avoidHighways: number;
	avoidTolls: number;
	fastestRoute: number;
}

export interface RoutePlaces {
	origin: { placeId: string };
	destination: { placeId: string };
}

/**
 * Lee la fila única de `MAGIIS_ROUTES` para una combinación completa de flags (índice único
 * `UX_MAGIIS_ROUTES_ROUTE_KEY`), o `null` si todavía no existe (próxima request = INSERT).
 */
export async function readRouteRow(
	db: OracleDb,
	route: RoutePlaces,
	flagValues: RouteFlagValues
): Promise<RouteRow | null> {
	const rows = await db.query<RouteRow>(
		`SELECT ID, USED FROM MAGIIS_ROUTES
		 WHERE PICKUP_PLACE_ID = :o AND DROPOFF_PLACE_ID = :d
		   AND AVOID_HIGHWAYS = :avoidHighways AND AVOID_TOLLS = :avoidTolls AND FASTEST_ROUTE = :fastestRoute
		 ORDER BY ID DESC FETCH FIRST 1 ROWS ONLY`,
		{
			o: route.origin.placeId,
			d: route.destination.placeId,
			avoidHighways: flagValues.avoidHighways,
			avoidTolls: flagValues.avoidTolls,
			fastestRoute: flagValues.fastestRoute
		}
	);
	return rows[0] ?? null;
}
