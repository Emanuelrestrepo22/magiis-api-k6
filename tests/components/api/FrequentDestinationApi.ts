// tests/components/api/FrequentDestinationApi.ts
// KATA Architecture — Layer 3: componente del dominio FrequentDestination (destinos frecuentes).
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - @atc('TM-930') es el ATC (acción + fixed assertion HTTP) del gate de despliegue de MG-682.
//   - @atc('TM-932') / @atc('TM-933') son los ATCs de TC03/TC04 (flags EXPLÍCITOS, ver más abajo).
//   - `findUpdatableDestination` es un helper de Discover (@step, silent fail → null): no es un
//     mini-flujo de negocio, solo localiza un destino frecuente existente con datos completos
//     para poder editarlo sin inventar un alta nueva.
//   - `readDestinationFlags` es el ORÁCULO DE API post-update (@step, silent fail → null): relee
//     el destino frecuente por `paginated` y devuelve sus 3 flags de ruta. Reemplaza al driver
//     Oracle como fuente de verdad de estos casos — el endpoint `paginated` YA serializa
//     `fastestRoute`/`avoidTolls`/`avoidHighways` como booleanos por elemento (verificado en vivo
//     contra producción, 2026-09-09): si el mapper persistiera NULL, el DTO lo mostraría ahí mismo.
//
// DISEÑO ENV-AWARE (2026-09-09): ningún ATC ni Discover de este archivo hardcodea carrier, tarifa
// ni parámetro esperado. `findUpdatableDestination` acepta `carrierRateId` OPCIONAL: si no se lo
// pasan, descubre las tarifas del carrier (`GET carriers/rate/{carrierId}`) y prueba las primeras
// (hasta `MAX_CARRIER_RATE_CANDIDATES`) en orden hasta encontrar una con un destino frecuente
// completo — así el mismo componente corre en cualquier entorno sin que el spec conozca de
// antemano la tarifa. El Discover también devuelve el `carrierRateId` efectivamente usado y un
// snapshot (`RouteFlagsSnapshot`) de los 3 flags vigentes ANTES de mutar, para que el spec pueda
// restaurar el estado original sin depender de DB.
//
// TICKET: BUG-MG-682 (flags de ruta avoidTolls/avoidHighways/fastestRoute). TM-930 (TC01, Xray
// proyecto TM) es el smoke gate: confirma que el mapper NUNCA persiste NULL cuando los tres flags
// llegan en `null` explícito — independientemente de si el valor final coincide con el parámetro
// del carrier (esa pregunta es de TM-931/TC02, fuera de este alcance).
//
// TM-932 (TC03) / TM-933 (TC04): ambos ejercitan el MISMO endpoint con el MISMO shape de payload
// (`{ id, ...base, ...flags }`, donde `flags` puede omitir una clave -no viaja en el JSON- o
// enviarla en `null`/`boolean` explícito) pero verifican columnas y aserciones DISTINTAS:
//   - TM-932: el flag EXPLÍCITO enviado no se aplana contra el default del carrier (persiste tal
//     cual se envía, incluso si contradice PARAMETERS del carrier).
//   - TM-933: el flag enviado NO contamina la resolución de los OTROS DOS flags (enviados en
//     `null` explícito en el mismo body) — que deben resolverse cada uno contra SU PROPIO
//     PARAMETERS del carrier, sin importar qué se envió en el flag hermano.
// DECISIÓN DE DISEÑO (documentada por pedido explícito de la sesión): el decorador `@atc(testId)`
// hornea el `testId` en el momento de la DECLARACIÓN del método (ver tests/utils/decorators.ts) y
// lo empuja en CADA invocación — si TM-932 y TM-933 compartieran el mismo método decorado, el
// reporter Xray (modo EMIT-ALL, ver xray-reporter.ts::extractTestKeys) acreditaría AMBAS keys a
// cada test que lo invoque, aunque ese test solo cubra una de las dos aserciones. Por eso NO se
// comparte un único `@atc`: se definen dos ATCs finos (`updateExplicitRouteFlagOverridesCarrierDefault`
// @atc('TM-932') y `updateSingleFlagWithoutContaminatingOthers` @atc('TM-933')) que delegan en
// `updateWithRouteFlags` — PÚBLICO pero SIN decorar (no es un ATC, es la acción HTTP compartida) —
// así ningún ATC llama a otro ATC (regla KATA) y cada test emite SOLO su propia key. El spec
// también llama a `updateWithRouteFlags` directamente en su `afterEach` para restaurar el destino
// frecuente mutado sin generar evidencia falsa de TM-932 ni de TM-933 (restaurar no es la acción
// bajo prueba). TM-930 delega en el mismo `updateWithRouteFlags`, forzando los 3 flags en `null`
// explícito DENTRO del método sin importar lo que traiga `args.flags`: la interfaz de argumento
// (`UpdateRouteFlagsArgs`) se reutiliza por consistencia de shape entre los 3 ATCs, no porque
// TM-930 necesite un patch configurable — su escenario es siempre "los 3 en null".

import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';
import { readJsonSafe } from '@helpers';

export interface FrequentDestinationBase {
	name: string;
	origin: { placeId: string; latitude: string; longitude: string };
	destiny: { placeId: string; latitude: string; longitude: string };
	radioOrigin: number;
	radioDestination: number;
	priceUnit: string;
	price: number;
	carrierRateId: number;
}

/**
 * Patch de flags de ruta para el update. Semántica por clave (importa la distinción, TM-932/TM-933
 * dependen de ella):
 *   - ausente (`undefined`)  → la clave NO viaja en el JSON del body (omitida).
 *   - `null`                 → la clave viaja explícita en `null`.
 *   - `boolean`              → la clave viaja explícita con ese valor.
 */
export interface RouteFlagsPatch {
	avoidTolls?: boolean | null;
	avoidHighways?: boolean | null;
	fastestRoute?: boolean | null;
}

export interface UpdateRouteFlagsArgs {
	base: FrequentDestinationBase;
	carrierId: number;
	flags: RouteFlagsPatch;
}

/**
 * Snapshot de los 3 flags de ruta tal como los devuelve la API en un momento dado. `null` significa
 * "el backend efectivamente persiste/devuelve NULL en esa clave" (el propio defecto que TM-930
 * verifica que no pase) — nunca "no se pudo leer": esa ausencia la modela el `| null` del Discover
 * completo (`findUpdatableDestination` / `readDestinationFlags` devuelven `null` en ese caso).
 */
export interface RouteFlagsSnapshot {
	avoidTolls: boolean | null;
	avoidHighways: boolean | null;
	fastestRoute: boolean | null;
}

interface FrequentDestinationResponseDTO {
	id?: number;
	name?: string;
	origin?: { placeId?: string; latitude?: string; longitude?: string };
	destiny?: { placeId?: string; latitude?: string; longitude?: string };
	radioOrigin?: number;
	radioDestination?: number;
	priceUnit?: unknown;
	price?: number;
	carrierRateId?: number;
	avoidTolls?: boolean | null;
	avoidHighways?: boolean | null;
	fastestRoute?: boolean | null;
}

/** Elemento de `GET carriers/rate/{carrierId}` (array plano) — solo interesa el `id`. */
interface CarrierRateListItem {
	id?: number;
	name?: string;
}

/** `boolean` tal cual; cualquier otra cosa (incluido `null`/`undefined`) se normaliza a `null`. */
function normalizeFlag(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null;
}

/** Tope de tarifas candidatas a probar cuando `findUpdatableDestination` no recibe `carrierRateId`. */
const MAX_CARRIER_RATE_CANDIDATES = 6;

/** Tamaño de página y tope de páginas del oráculo post-update (`readDestinationFlags`). */
const PAGINATED_PAGE_SIZE = 50;
const MAX_PAGINATED_PAGES = 10;

export class FrequentDestinationApi extends ApiBase {
	/**
	 * ATC: edita un destino frecuente con avoidTolls/avoidHighways/fastestRoute en null
	 * explícito y confirma que el mapper nunca persiste NULL (gate de despliegue de MG-682).
	 * Ignora `args.flags`: el escenario de este ATC es SIEMPRE "los 3 flags en null explícito"
	 * (ver nota de diseño al inicio del archivo) — `args` se reutiliza solo por el shape de
	 * `base`/`carrierId`, consistente con TM-932/TM-933.
	 * Fixed assertions:
	 *  - HTTP 200
	 */
	@atc('TM-930', { description: 'destino frecuente — flags nunca NULL (smoke gate)' })
	async updateOmittingRouteFlagsNeverPersistsNull(fdId: number, args: UpdateRouteFlagsArgs): Promise<APIResponse> {
		return this.updateWithRouteFlags(fdId, {
			base: args.base,
			carrierId: args.carrierId,
			flags: { avoidTolls: null, avoidHighways: null, fastestRoute: null }
		});
	}

	/**
	 * ATC: edita un destino frecuente enviando UN flag de ruta EXPLÍCITO (el resto de los flags
	 * queda OMITIDO del body, no en null) y confirma que ese valor explícito persiste tal cual,
	 * incluso cuando contradice el `PARAMETERS` del carrier para esa misma key (TC03 — MG-682).
	 * Fixed assertions:
	 *  - HTTP 200
	 * Ver nota de diseño al inicio del archivo: delega en `updateWithRouteFlags` (NO decorado) en
	 * vez de compartir el `@atc` de TM-933, para no contaminar la trazabilidad Xray de ese caso.
	 */
	@atc('TM-932', { description: 'destino frecuente — flag explícito no se aplana contra el default del carrier' })
	async updateExplicitRouteFlagOverridesCarrierDefault(fdId: number, args: UpdateRouteFlagsArgs): Promise<APIResponse> {
		return this.updateWithRouteFlags(fdId, args);
	}

	/**
	 * ATC: edita un destino frecuente enviando UN flag de ruta EXPLÍCITO junto con los otros DOS
	 * en `null` explícito en el MISMO body, y confirma que el flag enviado no contamina la
	 * resolución de los flags omitidos -cada uno debe resolverse contra SU PROPIO `PARAMETERS` del
	 * carrier- (TC04 — MG-682, label `defect-found`).
	 * Fixed assertions:
	 *  - HTTP 200
	 * Ver nota de diseño al inicio del archivo: delega en `updateWithRouteFlags` (NO decorado) en
	 * vez de compartir el `@atc` de TM-932, para no contaminar la trazabilidad Xray de ese caso.
	 */
	@atc('TM-933', { description: 'destino frecuente — un flag explícito no contamina la resolución de los otros dos' })
	async updateSingleFlagWithoutContaminatingOthers(fdId: number, args: UpdateRouteFlagsArgs): Promise<APIResponse> {
		return this.updateWithRouteFlags(fdId, args);
	}

	/**
	 * ATC (contrato de API, TM-1436 · MG-1002-AC3): pide los destinos frecuentes de un pasajero con un
	 * `carrierRateId` ajeno, inexistente, 0 o no numérico (el front no puede enviarlo: no hay selector de
	 * tarifador). Oráculo (Gherkin + Dev 20/10/2026): error controlado, NUNCA 5xx y el cuerpo no es una lista de
	 * destinos; el status/errorCode exactos se registran como «comportamiento observado».
	 * Fixed assertions:
	 *  - HTTP 4xx (nunca 5xx)
	 *  - el cuerpo no es un array (sin destinos de un tarifador ajeno)
	 */
	@atc('TM-1436', { description: 'frequentDestinationByPass con carrierRateId ajeno — error controlado, sin destinos' })
	async getByPassWithForeignCarrierRateId(
		carrierId: number,
		args: { passengerUserId: number; carrierRateId: string | number }
	): Promise<APIResponse> {
		const res = await this.api.getJson(`carriers/${carrierId}/frequentDestinationByPass/${args.passengerUserId}`, {
			params: { carrierRateId: args.carrierRateId }
		});
		const text = await res.text();
		expect(
			res.status(),
			`carrierRateId=${args.carrierRateId} -> HTTP ${res.status()}: ${text.slice(0, 300)}`
		).toBeGreaterThanOrEqual(400);
		expect(
			res.status(),
			`carrierRateId=${args.carrierRateId} no debe responder 5xx: ${text.slice(0, 300)}`
		).toBeLessThan(500);
		const body = await readJsonSafe<unknown>(res);
		expect(Array.isArray(body), 'el error no debe traer una lista de destinos').toBe(false);
		return res;
	}

	/**
	 * Control (SIN `@atc`): pide los destinos frecuentes del pasajero tal como lo hace la pantalla, sin
	 * `carrierRateId` — espera 200 y devuelve la lista. Silent fail: `null` si no responde 200 con un array.
	 */
	@step
	async getByPassWithoutCarrierRateId(
		carrierId: number,
		passengerUserId: number
	): Promise<Array<{ id?: number; name?: string }> | null> {
		const res = await this.api.getJson(`carriers/${carrierId}/frequentDestinationByPass/${passengerUserId}`);
		if (res.status() !== 200) return null;
		const list = await readJsonSafe<Array<{ id?: number; name?: string }>>(res);
		return Array.isArray(list) ? list : null;
	}

	/**
	 * Acción HTTP compartida — PÚBLICA pero SIN decorar (NO es un ATC): ejecuta el POST de update
	 * con flags de ruta parciales (ver `RouteFlagsPatch`) y la fixed assertion HTTP 200. La usan
	 * TM-930, TM-932 y TM-933 (ningún ATC llama a otro ATC — regla KATA, los tres llaman a este
	 * método) y también el spec directamente en su `afterEach`, para restaurar el destino frecuente
	 * mutado sin acreditar esa restauración como evidencia de ningún Test de Xray.
	 */
	async updateWithRouteFlags(fdId: number, args: UpdateRouteFlagsArgs): Promise<APIResponse> {
		const res = await this.api.postJson(`carriers/${args.carrierId}/frequentDestination/update`, {
			id: fdId,
			...args.base,
			...args.flags
		});
		expect(res.status()).toBe(200);
		return res;
	}

	/**
	 * Discover: localiza un destino frecuente EXISTENTE del carrier con todos los campos
	 * requeridos por el update (origin/destiny con placeId, radios, priceUnit, price,
	 * carrierRateId), junto con el `carrierRateId` efectivamente usado y el snapshot de sus 3
	 * flags de ruta VIGENTES (antes de que el spec mute nada). Silent fail (utilidad, no ATC):
	 * devuelve `null` si no encuentra ninguno — el spec decide si skipea.
	 *
	 * `carrierRateId` es OPCIONAL: si no se pasa, se descubren las tarifas del carrier
	 * (`GET carriers/rate/{carrierId}`) y se prueban las primeras (hasta `MAX_CARRIER_RATE_CANDIDATES`)
	 * en el orden que las devuelve el backend, hasta encontrar una con un destino frecuente completo.
	 */
	@step
	async findUpdatableDestination(
		carrierId: number,
		carrierRateId?: number
	): Promise<
		({ id: number; carrierRateId: number; currentFlags: RouteFlagsSnapshot } & FrequentDestinationBase) | null
	> {
		const candidates = await this.resolveCandidateRateIds(carrierId, carrierRateId);
		for (const rateId of candidates) {
			const complete = await this.findCompleteDestinationForRate(carrierId, rateId);
			if (!complete) continue;
			return {
				id: complete.id,
				name: complete.name ?? `QA-MG682-AUTO-${complete.id}`,
				origin: {
					placeId: complete.origin!.placeId as string,
					latitude: complete.origin!.latitude as string,
					longitude: complete.origin!.longitude as string
				},
				destiny: {
					placeId: complete.destiny!.placeId as string,
					latitude: complete.destiny!.latitude as string,
					longitude: complete.destiny!.longitude as string
				},
				radioOrigin: complete.radioOrigin as number,
				radioDestination: complete.radioDestination as number,
				priceUnit: String(complete.priceUnit),
				price: complete.price as number,
				carrierRateId: rateId,
				currentFlags: {
					avoidTolls: normalizeFlag(complete.avoidTolls),
					avoidHighways: normalizeFlag(complete.avoidHighways),
					fastestRoute: normalizeFlag(complete.fastestRoute)
				}
			};
		}
		return null;
	}

	/**
	 * Discover: relee un destino frecuente por `paginated` (paginando hasta `MAX_PAGINATED_PAGES`
	 * páginas de `PAGINATED_PAGE_SIZE`) y devuelve sus 3 flags de ruta — el ORÁCULO DE API que
	 * reemplaza al driver Oracle: el endpoint ya serializa los 3 flags como booleanos por elemento,
	 * así que si el mapper persistiera NULL este Discover lo vería. Silent fail (utilidad, no ATC):
	 * `null` si no encuentra el `fdId` pedido, o si el endpoint no responde 200.
	 */
	@step
	async readDestinationFlags(
		carrierId: number,
		args: { carrierRateId: number; fdId: number }
	): Promise<RouteFlagsSnapshot | null> {
		for (let page = 1; page <= MAX_PAGINATED_PAGES; page++) {
			const res = await this.api.getJson(`carriers/${carrierId}/frequentDestination/paginated`, {
				params: {
					page,
					size: PAGINATED_PAGE_SIZE,
					column: 'id',
					sort: 'ASC',
					carrierRateId: args.carrierRateId,
					find: ''
				}
			});
			if (res.status() !== 200) return null;
			const body = await readJsonSafe<{ content?: FrequentDestinationResponseDTO[] }>(res);
			const content = body?.content;
			if (!Array.isArray(content)) return null;
			const match = content.find((d) => d.id === args.fdId);
			if (match) {
				return {
					avoidTolls: normalizeFlag(match.avoidTolls),
					avoidHighways: normalizeFlag(match.avoidHighways),
					fastestRoute: normalizeFlag(match.fastestRoute)
				};
			}
			if (content.length < PAGINATED_PAGE_SIZE) return null; // última página: no está
		}
		return null;
	}

	/**
	 * Resuelve las tarifas candidatas para el Discover: la explícita si se pasó una, o las
	 * primeras `MAX_CARRIER_RATE_CANDIDATES` que devuelve `GET carriers/rate/{carrierId}` (array
	 * plano). Silent fail: `[]` ante cualquier respuesta no-200 o shape inesperado.
	 */
	private async resolveCandidateRateIds(carrierId: number, explicitRateId?: number): Promise<number[]> {
		if (explicitRateId !== undefined) return [explicitRateId];
		const res = await this.api.getJson(`carriers/rate/${carrierId}`, { params: { name: '' } });
		if (res.status() !== 200) return [];
		const list = await readJsonSafe<CarrierRateListItem[]>(res);
		if (!Array.isArray(list)) return [];
		return list
			.map((r) => r.id)
			.filter((id): id is number => typeof id === 'number')
			.slice(0, MAX_CARRIER_RATE_CANDIDATES);
	}

	/**
	 * Busca, para UNA tarifa puntual, un destino frecuente con todos los campos que exige el
	 * update. Deliberadamente NO usa `expectPageShape` (que assert-throws ante un shape
	 * inesperado): con varias tarifas candidatas, una respuesta rara en la tarifa N no puede
	 * abortar el Discover completo — tiene que poder seguir probando la tarifa N+1. Silent fail:
	 * `null` ante cualquier respuesta no-200 o shape inesperado, o si ninguna fila está completa.
	 */
	private async findCompleteDestinationForRate(
		carrierId: number,
		carrierRateId: number
	): Promise<(FrequentDestinationResponseDTO & { id: number }) | null> {
		// `carrierRateId` es OBLIGATORIO: sin él el backend responde 500 "No value present"
		// (verificado contra TEST el 2026-09-07). Los demás parámetros replican los que envía
		// el portal Carrier al abrir la pestaña de destinos frecuentes de una tarifa.
		const res = await this.api.getJson(`carriers/${carrierId}/frequentDestination/paginated`, {
			params: { page: 1, size: PAGINATED_PAGE_SIZE, column: 'id', sort: 'ASC', carrierRateId, find: '' }
		});
		if (res.status() !== 200) return null;
		const body = await readJsonSafe<{ content?: FrequentDestinationResponseDTO[] }>(res);
		const content = body?.content;
		if (!Array.isArray(content)) return null;
		const complete = content.find(
			(d): d is FrequentDestinationResponseDTO & { id: number } =>
				typeof d.id === 'number' &&
				!!d.origin?.placeId &&
				!!d.origin.latitude &&
				!!d.origin.longitude &&
				!!d.destiny?.placeId &&
				!!d.destiny.latitude &&
				!!d.destiny.longitude &&
				typeof d.radioOrigin === 'number' &&
				typeof d.radioDestination === 'number' &&
				d.priceUnit != null &&
				typeof d.price === 'number' &&
				typeof d.carrierRateId === 'number'
		);
		return complete ?? null;
	}
}
