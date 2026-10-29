// tests/data/mg682/index.ts
// Datos de la campaña MG-682 (flags de ruta) resueltos POR ENTORNO. Fuente única para los specs
// de TM-930/932/933/934/937/945: ningún spec vuelve a hardcodear carriers, tarifas ni rutas.
//
// POR QUÉ EXISTE: la primera vuelta de esta campaña se escribió contra TEST con literales
// (carrier 1521, carrierRateId 2261/1201, par de places de Mar del Plata). Ese material NO es
// portable a producción — el carrier, la tarifa y hasta el país cambian — y un literal de otro
// entorno filtrado en un spec produce un 500 o, peor, un PASSED que verificó otra cosa.
//
// CONTRATO:
//   - `carrierId` sale SIEMPRE de `MAGIIS_TEST_CARRIER_ID` (.env.<env>) vía runtime config.
//   - `carrierRateId` NO vive acá: se descubre en runtime (FrequentDestinationApi.findCarrierRateId).
//   - `expectedParams` NO vive acá: se lee en vivo del backend (CarrierParametersApi) — el oráculo
//     de estos casos es "la fila persistida coincide con PARAMETERS del carrier", así que el valor
//     esperado se consulta, nunca se asume.
//   - `carrierWithFastestRouteTrueId` es `null` en los entornos donde no existe un carrier con
//     FASTEST_ROUTE=true accesible con la credencial de la suite: las filas de la matriz que
//     exigen ese rol se SKIPEAN con motivo, jamás se "arreglan" tocando PARAMETERS.
//
// EVIDENCIA DE PRODUCCIÓN (réplica de lectura de producción, 2026-09-09):
//   carrier 1040 → FASTEST_ROUTE=false · AVOID_TOLLS=false · AVOID_HIGHWAYS=false ·
//   INSTANT_ASSIGNMENT=false · AUTODISPATCH_CARRIER=true · TRAVEL_CANCELLATION=false.
//   No hay ningún otro carrier con credencial en `.env.prod`, así que el rol "parámetro en true"
//   no es cubrible en producción.

import { getCurrentEnv, getRuntimeConfig } from '@config/runtime';

/** Los tres flags de ruta de MG-682, con el nombre que usan los DTOs de la API. */
export type RouteFlagName = 'avoidTolls' | 'avoidHighways' | 'fastestRoute';

/** PARAMETERS.KEY que gobierna cada flag (mapa único de la campaña). */
export const PARAMETER_KEY_BY_FLAG: Record<RouteFlagName, string> = {
	avoidTolls: 'AVOID_TOLLS',
	avoidHighways: 'AVOID_HIGHWAYS',
	fastestRoute: 'FASTEST_ROUTE'
};

/**
 * Columna de `FREQUENTDESTINATION` / `TRAVEL` por flag. OJO con la asimetría de nombres del
 * esquema (verificada contra ALL_TAB_COLUMNS en la réplica de producción, 2026-09-09):
 *   FREQUENTDESTINATION / TRAVEL / RECURRING_TRIPS → FASTEST_ROUTE, AVOIDTOLLS, AVOIDHIGHWAYS
 *   AFFI_OS_TRAVEL / MAGIIS_ROUTES                 → FASTEST_ROUTE, AVOID_TOLLS, AVOID_HIGHWAYS
 */
export const DB_COLUMN_BY_FLAG: Record<RouteFlagName, 'FASTEST_ROUTE' | 'AVOIDTOLLS' | 'AVOIDHIGHWAYS'> = {
	avoidTolls: 'AVOIDTOLLS',
	avoidHighways: 'AVOIDHIGHWAYS',
	fastestRoute: 'FASTEST_ROUTE'
};

/** Columnas equivalentes en las tablas que sí usan guión bajo (AFFI_OS_TRAVEL, MAGIIS_ROUTES). */
export const UNDERSCORED_DB_COLUMN_BY_FLAG: Record<RouteFlagName, 'FASTEST_ROUTE' | 'AVOID_TOLLS' | 'AVOID_HIGHWAYS'> =
	{
		avoidTolls: 'AVOID_TOLLS',
		avoidHighways: 'AVOID_HIGHWAYS',
		fastestRoute: 'FASTEST_ROUTE'
	};

export interface RoutePlace {
	placeId: string;
	latitude: string;
	longitude: string;
}

export interface RoutePair {
	origin: RoutePlace;
	destination: RoutePlace;
}

export interface Mg682EnvData {
	/** Carrier bajo prueba. Sale de `MAGIIS_TEST_CARRIER_ID`; nunca se escribe literal en un spec. */
	carrierId: number;
	/**
	 * Carrier con `PARAMETERS.FASTEST_ROUTE = true` accesible con la credencial del entorno, o
	 * `null` si no existe ninguno. Las filas de la matriz que necesitan ese rol se skipean.
	 */
	carrierWithFastestRouteTrueId: number | null;
	/** Par origen/destino válido en el país del carrier del entorno. */
	route: RoutePair;
	/** Prefijo de `originToken` — hace rastreable en DB todo lo que dejó la automatización. */
	originTokenPrefix: string;
}

/**
 * TEST — carrier 1521 (FASTEST_ROUTE=true) y par de places confirmado en la regresión del
 * 2026-09-07 (`evidence/regresion-2026-09-07/api/MG-682-REG-TC05-api-1521-request.json`).
 */
const TEST_DATA: Omit<Mg682EnvData, 'carrierId'> = {
	carrierWithFastestRouteTrueId: 1521,
	route: {
		origin: { placeId: 'ChIJ1TTt69S1vJURa1ppgy2gVfI', latitude: '-34.56151', longitude: '-58.45901' },
		destination: { placeId: 'ChIJD0zcgMvdhJURkZqCZ7ciEBY', latitude: '-38.0277922', longitude: '-57.5323172' }
	},
	originTokenPrefix: 'QA-MG682-TEST-'
};

/**
 * PRODUCCIÓN — carrier 1040. Par de places tomado de un destino frecuente REAL del propio carrier
 * (FD 7724 "Sebastian Prueba", tarifa 1201), leído por API el 2026-09-09: es una ruta corta de CABA
 * (1,72 km / 467 s confirmados por `POST /travels/times`), así que el cómputo no depende de un
 * tramo interurbano ni de peajes de otro mercado.
 * No hay carrier con FASTEST_ROUTE=true accesible con la credencial de `.env.prod` → `null`.
 */
const PROD_DATA: Omit<Mg682EnvData, 'carrierId'> = {
	carrierWithFastestRouteTrueId: null,
	route: {
		origin: { placeId: 'ChIJb76l9MzKvJURb8q_ZQpZ32o', latitude: '-34.6016935', longitude: '-58.3740071' },
		destination: { placeId: 'ChIJo_kZXzI1o5URmEpzuj-5NP0', latitude: '-34.6021563', longitude: '-58.3684163' }
	},
	originTokenPrefix: 'QA-MG682-PROD-'
};

/**
 * UAT — sin campaña MG-682 relevada. Se reutiliza el material de TEST salvo el rol
 * "parámetro en true", que no está verificado en ese entorno: las filas que lo pidan skipean.
 */
const UAT_DATA: Omit<Mg682EnvData, 'carrierId'> = {
	carrierWithFastestRouteTrueId: null,
	route: TEST_DATA.route,
	originTokenPrefix: 'QA-MG682-UAT-'
};

const DATA_BY_ENV: Record<'test' | 'uat' | 'prod', Omit<Mg682EnvData, 'carrierId'>> = {
	test: TEST_DATA,
	uat: UAT_DATA,
	prod: PROD_DATA
};

/** Datos MG-682 del entorno activo (`ENV`). El `carrierId` viene de la config de runtime. */
export function mg682Data(): Mg682EnvData {
	const env = getCurrentEnv();
	return { carrierId: getRuntimeConfig().carrierId, ...DATA_BY_ENV[env] };
}

/** `originToken` único y rastreable para el entorno activo. */
export function mg682OriginToken(suffix: string): string {
	return `${mg682Data().originTokenPrefix}${suffix}-${Date.now()}`;
}
