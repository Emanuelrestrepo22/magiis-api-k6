// tests/components/api/PlacesApi.ts
// KATA Architecture — Layer 3: componente del dominio Places (autocompletado de direcciones).
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - cada método @atc = ATC completo (acción + fixed assertion tolerante + return para encadenar).
//   - los métodos SIN @atc son helpers de derivación de datos (silent fail → null).
//
// TICKET: MG-117 (App Driver migra el autocompletado de Google Places al endpoint propio del
// backend). El backend correspondiente (MG-118) ya está productivo desde v1.72.8.
// Trazabilidad: Xray Tests del proyecto TM — TM-651 / TM-658 / TM-659 / TM-660 / TM-661 / TM-664.
// MG-117 es la Story (requisito), NO es un Test → nunca se usa como key de @atc.
//
// CONTRATO REAL MEDIDO EN VIVO (uat, prefijo magiis-v0.2) — manda sobre el AC del ticket.
// El ambiente por default del repo es uat (config/runtime.ts + playwright.config.ts) y TEST está
// fuera de alcance: toda medición citada acá se re-verificó en uat (13/13, datos idénticos).
//   GET places/autocomplete
//   request  : address (String, REQUERIDO) + latitude/longitude (Double, opcionales y en PAREJA).
//              `radius`, `language`, `sessionToken` NO forman parte del contrato: Spring los
//              descarta en silencio (200 + respuesta idéntica al baseline). POST → 405.
//   response : ARRAY JSON pelado (sin envelope `predictions`/`data`), 9 campos por predicción:
//              placeId · mainText · secondaryText · shortName · latitude · longitude · airport ·
//              iataCode · source.
//   longitud : len<=2 ⇒ []; len==3 ⇒ SOLO match exacto por IATA; len>=4 ⇒ aeropuertos por nombre
//              + direcciones de cache/Google.
//   nulos    : placeId puede venir null (solo en predicciones de aeropuerto); latitude/longitude
//              vienen null cuando source=GOOGLE; latitude/longitude se serializan como STRING.
//
// DESVIACIONES DEL AC (medidas, no asumidas — ver reporte QA):
//   1. el campo serializado es `airport`, NUNCA `isAirport` (aserción contra isAirport = green vacío);
//   2. `radius` y `language` NO se reciben (el radio de 10 km es del backend, no ajustable);
//   3. `placeId` sí llega null en predicciones de aeropuerto;
//   4. existe un tercer `source` no documentado: GOOGLE (y ese trae coordenadas null).

import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';
import { expectArray, readJsonSafe } from '@helpers';

const AUTOCOMPLETE_PATH = 'places/autocomplete';

/**
 * Status EXACTO cuando falta el único parámetro requerido (`address`) — medido: 400.
 *
 * Antes esto era un rango tolerante `[400, 403, 404]`, más ancho que la realidad: un 404 ("la ruta
 * no existe") o un 403 ("token vencido") contaban como "el backend valida el parámetro requerido".
 * Un endpoint ya productivo no necesita esa tolerancia: 400 exacto o es un hallazgo.
 */
const MISSING_ADDRESS_STATUS = 400;

/**
 * Fragmento estable del error de Spring cuando falta `address` ("Required String parameter
 * 'address' is not present"). Se valida el NOMBRE del parámetro, no la frase completa: la redacción
 * cambia entre versiones de Spring, el nombre del parámetro es el contrato.
 */
const MISSING_ADDRESS_TOKEN = 'address';

/** Campos del DTO serializado (medidos: unión de claves sobre 104 predicciones = exactamente estos 9). */
const CONTRACT_KEYS = [
	'placeId',
	'mainText',
	'secondaryText',
	'shortName',
	'latitude',
	'longitude',
	'airport',
	'iataCode',
	'source'
] as const;

/** Valores de `source` observados. GOOGLE no está documentado en el AC pero existe. */
const KNOWN_SOURCES = ['AIRPORT', 'CACHE', 'GOOGLE'];

/** El AC dice `isAirport`; el DTO real serializa `airport`. Guarda anti-aserción-vacía. */
const AC_PHANTOM_FIELD = 'isAirport';

/** Parámetros que el AC declara y el endpoint NO recibe. Se envían para probar que se ignoran. */
const OFF_CONTRACT_PARAMS: Record<string, string | number> = {
	radius: 10000,
	language: 'es',
	sessionToken: '11111111-2222-3333-4444-555555555555'
};

export interface Coordinates {
	latitude: number;
	longitude: number;
}

/** Shape mínimo de una predicción. El repo no usa zod/ajv: el contrato se fija con asserts. */
export interface AutocompletePrediction {
	/** Puede ser null en predicciones de aeropuerto (match por IATA o por nombre). */
	placeId: string | null;
	mainText: string;
	secondaryText: string | null;
	shortName: string;
	/** Decimal serializado como STRING; null cuando source=GOOGLE. */
	latitude: string | null;
	longitude: string | null;
	/** Señal de icono diferenciado del lado del cliente. El AC lo llama `isAirport` (no existe). */
	airport: boolean;
	iataCode: string | null;
	/** AIRPORT | CACHE | GOOGLE. */
	source: string;
}

export interface AutocompleteQuery {
	address: string;
	/** Origen del driver. Ambas coordenadas o ninguna: sueltas no aplican sesgo. */
	origin?: Coordinates | null;
	/** Parámetros fuera de contrato (radius/language/sessionToken) — solo para el ATC TM-651. */
	offContract?: Record<string, string | number>;
}

function describeOrigin(origin?: Coordinates | null): string {
	return origin ? `${origin.latitude},${origin.longitude}` : 'sin-coordenadas';
}

/**
 * Guarda de PRECONDICIÓN sobre los ARGUMENTOS del propio test — no es una verificación del sistema.
 *
 * Se lanza un Error en vez de usar `expect(...)` justamente para que no se pueda confundir con
 * cobertura: `expect(term.length).toBeGreaterThanOrEqual(4)` asserta sobre el literal que el spec
 * acaba de pasar (tautología), no sobre el backend. Si la precondición no se cumple, el test está
 * mal invocado y debe explotar con un mensaje que lo diga.
 */
function precondition(satisfied: boolean, message: string): void {
	if (!satisfied) throw new Error(`PRECONDICIÓN NO CUMPLIDA — ${message}`);
}

/**
 * Un plus code (Open Location Code) no es una dirección utilizable por un pasajero.
 *
 * Formato: 4+ caracteres del alfabeto OLC, un '+', y 2+ más. El alfabeto excluye vocales a propósito
 * para no formar palabras, así que el falso positivo sobre nombres de calle reales es improbable.
 * Ver MG-931 (39.605 filas en producción cuyo formatted_address es un plus code).
 */
const RE_PLUS_CODE = /\b[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}\b/;

export function isPlusCode(texto: string | null | undefined): boolean {
	return RE_PLUS_CODE.test(String(texto ?? ''));
}

/**
 * TM-727 — el defecto de orden: aeropuertos que matchean por NOMBRE (no por IATA) rankeados por
 * encima de direcciones de cache mucho más cercanas al usuario.
 *
 * Devuelve el índice (0-based) de la primera fila `source: CACHE`, y cuántas filas `airport: true`
 * la preceden. Sólo MIDE: el veredicto lo decide el ATC comparando contra el AC.
 */
export function airportsBeforeFirstCache(rows: AutocompletePrediction[]): {
	firstCacheIndex: number;
	airportsAhead: number;
} {
	const firstCacheIndex = rows.findIndex((r) => r.source === 'CACHE');
	if (firstCacheIndex === -1) {
		return { firstCacheIndex: -1, airportsAhead: rows.filter((r) => r.airport).length };
	}
	return {
		firstCacheIndex,
		airportsAhead: rows.slice(0, firstCacheIndex).filter((r) => r.airport).length
	};
}

export class PlacesApi extends ApiBase {
	// ── Transporte / helpers de datos (SIN @atc) ──────────────────────────────────────────

	/** Llamada cruda al autocompletado. Sin aserciones: la verificación vive en los ATCs. */
	async autocomplete(query: AutocompleteQuery): Promise<APIResponse> {
		const params: Record<string, string | number> = { address: query.address };
		if (query.origin) {
			params.latitude = query.origin.latitude;
			params.longitude = query.origin.longitude;
		}
		Object.assign(params, query.offContract ?? {});
		return this.api.getJson(AUTOCOMPLETE_PATH, { params });
	}

	/** Llamada sin el parámetro requerido `address` (negativo de contrato). */
	async autocompleteWithoutAddress(): Promise<APIResponse> {
		return this.api.getJson(AUTOCOMPLETE_PATH);
	}

	/**
	 * Deriva un origen real desde el propio endpoint (aeropuerto por IATA) para no hardcodear
	 * coordenadas en los specs.
	 *
	 * `null` significa UNA sola cosa: el endpoint respondió 200 y en sus datos no hay ningún
	 * aeropuerto con coordenadas (ausencia de DATOS → el spec puede skipear con razón).
	 *
	 * Un 403 (token vencido) o un 404 (ruta movida) NO son ausencia de datos y por eso FALLAN acá
	 * en vez de devolver `null`: los specs de TM-651 y TM-661 usan este helper detrás de un
	 * `test.skip(origin === null, ...)`, así que devolver null ante un fallo de auth o de ruta
	 * convertía la caída en un skip que culpaba al ambiente — suite verde con el endpoint roto.
	 */
	async resolveAirportOrigin(iata: string): Promise<Coordinates | null> {
		const res = await this.autocomplete({ address: iata });
		expect(
			res.status(),
			`resolveAirportOrigin("${iata}"): el endpoint debe responder 200. Un 403/404/5xx es un fallo de auth o de ruta, no ausencia de datos, y no debe degradarse a skip.`
		).toBe(200);
		const list = await readJsonSafe<AutocompletePrediction[]>(res);
		if (!Array.isArray(list)) return null;
		const row = list.find((p) => p.airport === true && p.latitude != null && p.longitude != null);
		if (!row) return null;
		const latitude = Number.parseFloat(String(row.latitude));
		const longitude = Number.parseFloat(String(row.longitude));
		if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
		return { latitude, longitude };
	}

	/**
	 * Firma estable del resultado (orden-insensible) para comparar dos respuestas sin depender
	 * del orden ni del md5 crudo. Tolerancia deliberada: el jitter de orden no debe romper el test,
	 * pero un set de resultados distinto sí se detecta.
	 */
	private signatureOf(list: AutocompletePrediction[]): string {
		return list
			.map((p) => `${p.source}|${p.mainText}|${p.iataCode ?? '-'}`)
			.sort()
			.join('\n');
	}

	/**
	 * Anti-false-green: exige que la lista traiga filas ANTES de cualquier comparación de firmas o
	 * recorrido de shape. Con `list = []`, `assertPredictionShape` ejecuta CERO aserciones y
	 * `signatureOf([]) === ''`, así que comparar dos vacíos es `'' === ''` → verde que no probó nada.
	 *
	 * Se ASSERTA (falla), nunca se skipea: si el término elegido por el spec dejó de traer datos, el
	 * caso no puede verificar su criterio y eso es un hallazgo, no una condición ambiental benigna.
	 *
	 * `what` nombra QUÉ se contó cuando lo contado no son "predicciones" crudas (p. ej. el subconjunto
	 * de filas con `placeId` nulo de TM-660). Default = 'predicciones' ⇒ los mensajes de los llamadores
	 * existentes no cambian.
	 */
	private assertNonEmpty(list: AutocompletePrediction[], context: string, why: string, what = 'predicciones'): void {
		expect(
			list.length,
			`${context}: el backend devolvió 0 ${what} y ${why}. Una lista vacía no verifica nada (false green).`
		).toBeGreaterThan(0);
	}

	/** Fija el shape contractual de cada predicción (incluida la guarda anti-`isAirport`). */
	private assertPredictionShape(list: AutocompletePrediction[], context: string): void {
		for (const p of list) {
			const row = p as unknown as Record<string, unknown>;
			for (const key of CONTRACT_KEYS) {
				expect(row, `${context}: predicción sin el campo contractual "${key}"`).toHaveProperty(key);
			}
			expect(
				Object.keys(row),
				`${context}: el DTO real serializa "airport"; "${AC_PHANTOM_FIELD}" (AC del ticket) no existe`
			).not.toContain(AC_PHANTOM_FIELD);
			expect(typeof p.airport, `${context}: "airport" debe ser boolean`).toBe('boolean');
			expect(KNOWN_SOURCES, `${context}: source desconocido "${p.source}"`).toContain(p.source);
			expect(p.mainText, `${context}: mainText vacío → la fila no es renderizable`).toBeTruthy();
		}
	}

	// ── ATCs ──────────────────────────────────────────────────────────────────────────────

	/**
	 * ATC TM-651: el request lleva `address` + las coordenadas del origen, y NO lleva
	 * `radius` ni `language` (se envían y se comprueba que el backend los ignora).
	 *
	 * Las dos patas se verifican de forma SIMÉTRICA, y eso es deliberado:
	 *   - `latitude`+`longitude` SÍ están en el contrato ⇒ el set de resultados debe CAMBIAR;
	 *   - `radius`/`language`/`sessionToken` NO están ⇒ el set debe quedar IGUAL.
	 * Sin la primera mitad, "el backend usa el origen" era indistinguible de "descarta el origen
	 * igual que radius": ambas hipótesis daban verde con solo `expect(status).toBe(200)`.
	 */
	@atc('TM-651', {
		description:
			'request = address + coordenadas del origen (sesgan el resultado); radius/language/sessionToken fuera de contrato (ignorados)'
	})
	async assertRequestContract(term: string, origin: Coordinates): Promise<[APIResponse, AutocompletePrediction[]]> {
		// 1) `address` es el único parámetro requerido: sin él el backend rechaza con 400 EXACTO.
		const missing = await this.autocompleteWithoutAddress();
		expect(
			missing.status(),
			'sin `address` el backend debe rechazar con 400 exacto (medido); un 403/404 no prueba validación de parámetro'
		).toBe(MISSING_ADDRESS_STATUS);
		expect(
			await missing.text(),
			'el 400 debe nombrar el parámetro faltante `address` (si no, el 400 puede venir de otra causa)'
		).toContain(MISSING_ADDRESS_TOKEN);

		// 2) baseline contractual mínimo: solo `address`. Es el punto de comparación de los pasos 3 y 4:
		//    si viene vacío, NINGUNA comparación de firmas posterior prueba nada → falla acá.
		const baseline = await this.autocomplete({ address: term });
		expect(baseline.status(), 'baseline address-only debe responder 200').toBe(200);
		const baselineList = await expectArray<AutocompletePrediction>(baseline);
		this.assertPredictionShape(baselineList, 'baseline address-only');
		this.assertNonEmpty(
			baselineList,
			`baseline address-only (term="${term}")`,
			'es el punto de comparación de las firmas de los pasos 3 y 4'
		);
		const baselineSignature = this.signatureOf(baselineList);

		// 3) `address` + coordenadas del origen: SÍ son parte del contrato ⇒ el origen DEBE sesgar.
		const withOrigin = await this.autocomplete({ address: term, origin });
		expect(withOrigin.status(), `address + origen (${describeOrigin(origin)}) debe responder 200`).toBe(200);
		const withOriginList = await expectArray<AutocompletePrediction>(withOrigin);
		this.assertPredictionShape(withOriginList, 'address + origen');
		this.assertNonEmpty(
			withOriginList,
			`address + origen (${describeOrigin(origin)})`,
			'sin filas no hay firma que comparar contra el baseline'
		);
		expect(
			this.signatureOf(withOriginList),
			`latitude+longitude SÍ son contrato: el origen ${describeOrigin(origin)} debe sesgar el resultado ` +
				'(set DISTINTO del baseline sin coordenadas). Firmas iguales ⇒ el backend está descartando el origen.'
		).not.toBe(baselineSignature);

		// 4) `radius`/`language`/`sessionToken` NO son parte del contrato: tolerados e IGNORADOS.
		//    Comparación por firma (no por bytes) para no romper por orden del result set.
		const offContract = await this.autocomplete({ address: term, offContract: OFF_CONTRACT_PARAMS });
		expect(offContract.status(), 'radius/language/sessionToken se ignoran: el request sigue siendo válido (200)').toBe(
			200
		);
		const offContractList = await expectArray<AutocompletePrediction>(offContract);
		this.assertPredictionShape(offContractList, 'address + parámetros fuera de contrato');
		this.assertNonEmpty(
			offContractList,
			'address + parámetros fuera de contrato',
			'comparar dos listas vacías da firmas iguales sin haber probado que se ignoran'
		);
		expect(
			this.signatureOf(offContractList),
			'radius/language/sessionToken NO deben alterar el resultado (el backend los descarta)'
		).toBe(baselineSignature);

		return [withOrigin, withOriginList];
	}

	/**
	 * ATC TM-658 — con 4+ caracteres el backend resuelve aeropuertos por NOMBRE y direcciones del
	 * cache/Google. `expectAirportSignal` decide CUÁL de las dos mitades del criterio se verifica,
	 * y el título del subcaso en el spec debe decir exactamente cuál:
	 *
	 *   - `true`  ⇒ se verifica la COMBINACIÓN real: al menos una fila `source=AIRPORT` (aeropuerto
	 *               resuelto por NOMBRE) Y al menos una fila de dirección.
	 *   - `false` ⇒ NO hay combinación que verificar: se caracteriza la fuente de datos, y se
	 *               asserta la AUSENCIA de pata de aeropuerto para que el título sea verificable.
	 *
	 * Antes, con `false` el bloque de aeropuerto se salteaba entero y el test solo comprobaba "hay
	 * >=1 fila no-AIRPORT" mientras el título afirmaba verificar la combinación de fuentes.
	 */
	@atc('TM-658', {
		description:
			'4+ caracteres: direcciones de cache/Google; la COMBINACIÓN con aeropuertos por nombre se verifica solo con expectAirportSignal=true'
	})
	async assertMultiSourceSearch(params: {
		term: string;
		origin?: Coordinates | null;
		expectAirportSignal: boolean;
	}): Promise<[APIResponse, AutocompletePrediction[]]> {
		const { term, origin = null, expectAirportSignal } = params;
		precondition(term.length >= 4, `el término "${term}" debe tener 4+ caracteres para ejercer esta regla del backend`);

		const res = await this.autocomplete({ address: term, origin });
		expect(res.status(), `autocomplete("${term}") no debe 5xx`).not.toBe(500);
		expect(res.status(), `autocomplete("${term}") debe responder 200`).toBe(200);
		const list = await expectArray<AutocompletePrediction>(res);
		this.assertPredictionShape(list, `term="${term}"`);

		expect(list.length, `con 4+ caracteres ("${term}") debe haber al menos una predicción`).toBeGreaterThan(0);

		// Pata direcciones: al menos una fila que no sea un registro puro de aeropuerto.
		const addressRows = list.filter((p) => p.source !== 'AIRPORT');
		expect(addressRows.length, `"${term}" debe traer direcciones (source CACHE/GOOGLE)`).toBeGreaterThan(0);

		// Pata aeropuerto: fila AIRPORT o cualquier fila con la señal `airport`.
		const airportRows = list.filter((p) => p.source === 'AIRPORT' || p.airport === true);
		if (expectAirportSignal) {
			expect(airportRows.length, `"${term}" debe combinar aeropuertos con direcciones`).toBeGreaterThan(0);
			// La COMBINACIÓN prometida por el título es "aeropuertos por NOMBRE (source=AIRPORT) +
			// direcciones". `source === 'AIRPORT' || airport === true` NO la exige: una sola fila CACHE
			// con airport=true la satisface sin que exista ninguna resolución por nombre de aeropuerto.
			// Por eso la pata AIRPORT se exige por SOURCE, explícitamente.
			const airportSourceRows = list.filter((p) => p.source === 'AIRPORT');
			expect(
				airportSourceRows.length,
				`"${term}" se declaró como subcaso CON aeropuertos por nombre: debe traer al menos una fila ` +
					'source=AIRPORT. Una fila CACHE con airport=true no demuestra la resolución por NOMBRE de aeropuerto.'
			).toBeGreaterThan(0);
			for (const row of airportRows) {
				expect(row.iataCode, `la fila de aeropuerto "${row.mainText}" debe traer iataCode`).toBeTruthy();
			}
		} else {
			// CARACTERIZACIÓN asertada: el subcaso se declaró SIN pata de aeropuerto, así que se
			// verifica esa ausencia en vez de saltear el bloque y dejar el título sin respaldo.
			expect(
				airportRows.length,
				`"${term}" se declaró como subcaso SIN pata de aeropuerto (solo direcciones). Si ahora devuelve ` +
					'filas AIRPORT/airport=true, el término pasó a ejercer la combinación → moverlo a expectAirportSignal=true.'
			).toBe(0);
		}

		return [res, list];
	}

	/**
	 * ATC TM-659: un código IATA de 3 letras devuelve el aeropuerto con la señal del icono
	 * diferenciado. El payload no trae campo `icon`: la señal es `airport=true` + `iataCode`
	 * (+ source=AIRPORT y el convenio secondaryText "<IATA> · <PAÍS>").
	 */
	@atc('TM-659', { description: 'IATA de 3 letras → aeropuerto con señal de icono diferenciado' })
	async assertIataExactReturnsAirport(iata: string): Promise<[APIResponse, AutocompletePrediction]> {
		precondition(
			iata.length === 3,
			`"${iata}" debe ser un código IATA de 3 caracteres: la regla bajo prueba es "len==3 ⇒ match exacto por IATA"`
		);
		const code = iata.toUpperCase();

		const res = await this.autocomplete({ address: iata });
		expect(res.status(), `autocomplete("${iata}") no debe 5xx`).not.toBe(500);
		expect(res.status(), `autocomplete("${iata}") debe responder 200`).toBe(200);
		const list = await expectArray<AutocompletePrediction>(res);
		this.assertPredictionShape(list, `iata="${iata}"`);

		const match = list.find((p) => (p.iataCode ?? '').toUpperCase() === code && p.airport === true);
		expect(match, `el IATA "${code}" debe resolver un aeropuerto con airport=true e iataCode=${code}`).toBeDefined();
		const airport = match as AutocompletePrediction;
		expect(airport.source, 'la señal de icono viene de una predicción de aeropuerto').toBe('AIRPORT');
		// secondaryText es nullable por contrato: solo se valida el convenio cuando viene.
		if (airport.secondaryText) {
			expect(airport.secondaryText, `secondaryText debe portar el IATA (convenio "<IATA> · <PAÍS>")`).toContain(code);
		}

		return [res, airport];
	}

	/**
	 * ATC TM-660: una predicción de aeropuerto con `placeId` nulo se resuelve sin romper el flujo.
	 * Barre varios términos y devuelve las filas con placeId nulo.
	 *
	 * ANTI-FALSE-GREEN: el criterio de no-vacuidad vive ACÁ ADENTRO, no en el spec. Antes el barrido
	 * podía terminar con 0 filas nulas y el bucle de invariantes no ejecutaba NINGUNA aserción: el ATC
	 * devolvía `[]` en verde (medido con `["zzzqqqxxx"]` y con `["corrientes"]`), y solo el `test.skip`
	 * de UN spec lo enmascaraba — cualquier otro llamador del ATC público obtenía ese verde vacío.
	 * Un barrido sin filas nulas no demuestra que un `placeId` nulo se resuelve ⇒ falla, no skipea.
	 */
	@atc('TM-660', { description: 'predicción de aeropuerto con placeId nulo se resuelve sin romper el flujo' })
	async assertNullPlaceIdIsResolvable(terms: string[]): Promise<AutocompletePrediction[]> {
		const nullPlaceIdRows: AutocompletePrediction[] = [];

		for (const term of terms) {
			const res = await this.autocomplete({ address: term });
			// 200 ESTRICTO. Antes se toleraba 403/404 y se hacía `continue`: con un token vencido o la
			// ruta movida, el barrido terminaba con 0 filas nulas → el spec skipeaba → suite verde.
			// Un fallo de auth o de ruta es un FALLO, nunca un motivo de skip.
			expect(
				res.status(),
				`autocomplete("${term}") debe responder 200; 403 (auth) / 404 (ruta) / 5xx son fallos reales, no datos ausentes`
			).toBe(200);
			const list = await expectArray<AutocompletePrediction>(res);
			this.assertPredictionShape(list, `term="${term}"`);
			nullPlaceIdRows.push(...list.filter((p) => p.placeId === null || p.placeId === undefined));
		}

		// Guarda de no-vacuidad ANTES del bucle: con `nullPlaceIdRows = []` el for no corre y el ATC
		// devuelve verde sin haber verificado nada.
		this.assertNonEmpty(
			nullPlaceIdRows,
			`barrido de placeId nulo (términos: ${terms.join(', ')})`,
			'un barrido sin ninguna fila con placeId nulo no puede demostrar que una predicción con placeId nulo se resuelve sin romper el flujo',
			'filas con placeId nulo'
		);

		// Invariante medido: la nulidad de placeId solo aparece en predicciones de aeropuerto,
		// y la fila sigue siendo utilizable (texto renderizable + IATA como identificador alterno).
		for (const row of nullPlaceIdRows) {
			expect(row.mainText, 'una fila con placeId nulo debe seguir siendo renderizable (mainText)').toBeTruthy();
			expect(
				row.source === 'AIRPORT' || row.airport === true,
				`placeId nulo solo se espera en aeropuertos; llegó source=${row.source} airport=${String(row.airport)}`
			).toBe(true);
			expect(row.iataCode, `"${row.mainText}" sin placeId debe traer iataCode como identificador alterno`).toBeTruthy();
		}

		return nullPlaceIdRows;
	}

	/**
	 * ATC TM-661: la búsqueda por código IATA no aplica sesgo por ubicación (misma respuesta con
	 * y sin coordenadas). Incluye un término de CONTROL de dirección: si el control tampoco varía,
	 * el mecanismo de sesgo no es observable en el ambiente y el green sería vacío → el spec ASSERTA
	 * `controlVaried` (el mismo hecho que TM-651 asserta duro sobre el mismo término), no skipea.
	 *
	 * ANTI-FALSE-GREEN (era el peor caso de la suite): con un término que devuelve `[]` en las tres
	 * sondas, las tres firmas eran `''`, `uniqueSize === 1` y el test pasaba en verde afirmando "no
	 * aplica sesgo". Un IATA inexistente (`zzzqqqxxx`) pasaba. Ahora se exige (a) longitud 3 como
	 * precondición y (b) firma NO vacía: "no varía con el origen" tiene que ser distinguible de
	 * "no devuelve nada".
	 */
	@atc('TM-661', { description: 'la búsqueda por IATA no aplica sesgo por ubicación' })
	async assertIataSearchIgnoresLocationBias(params: {
		iata: string;
		controlTerm: string;
		origins: Coordinates[];
	}): Promise<{ iataSignature: string; controlSignatures: string[]; controlVaried: boolean }> {
		const { iata, controlTerm, origins } = params;
		precondition(
			iata.length === 3,
			`"${iata}" debe ser un IATA de 3 caracteres: con otra longitud el backend aplica otra regla y el ATC no prueba lo que dice`
		);
		precondition(
			origins.length > 0,
			'se necesita al menos un origen real para comparar contra la sonda sin coordenadas'
		);
		const probes: Array<Coordinates | null> = [null, ...origins];

		const iataSignatures: string[] = [];
		for (const origin of probes) {
			const res = await this.autocomplete({ address: iata, origin });
			expect(res.status(), `IATA "${iata}" (origen ${describeOrigin(origin)}) debe responder 200`).toBe(200);
			const list = await expectArray<AutocompletePrediction>(res);
			this.assertPredictionShape(list, `iata="${iata}" origen=${describeOrigin(origin)}`);
			this.assertNonEmpty(
				list,
				`iata="${iata}" origen=${describeOrigin(origin)}`,
				'"no varía con el origen" sería indistinguible de "no devuelve nada"'
			);
			iataSignatures.push(this.signatureOf(list));
		}
		const uniqueIata = new Set(iataSignatures);
		expect(
			uniqueIata.size,
			`la búsqueda por IATA "${iata}" no debe variar con el origen (firmas distintas: ${uniqueIata.size})`
		).toBe(1);
		// Redundante con assertNonEmpty a propósito: deja explícito en el reporte que la firma
		// comparada existe. Tres firmas vacías también dan uniqueSize=1 y no prueban nada.
		expect(
			iataSignatures[0],
			`la firma del IATA "${iata}" no puede ser vacía: 3 respuestas vacías también dan uniqueSize=1`
		).not.toBe('');

		// Control: una dirección SÍ debe variar con el origen; si no, el sesgo no es observable.
		// 200 estricto + no-vacío: antes un 403 dejaba `list = []` → controlVaried=false → skip.
		const controlSignatures: string[] = [];
		for (const origin of probes) {
			const res = await this.autocomplete({ address: controlTerm, origin });
			expect(
				res.status(),
				`control "${controlTerm}" (origen ${describeOrigin(origin)}) debe responder 200; un 403/404 no es "control invariante"`
			).toBe(200);
			const list = await expectArray<AutocompletePrediction>(res);
			this.assertNonEmpty(
				list,
				`control "${controlTerm}" origen=${describeOrigin(origin)}`,
				'un control vacío no puede demostrar que el sesgo por ubicación es observable en el ambiente'
			);
			controlSignatures.push(this.signatureOf(list));
		}

		return {
			iataSignature: iataSignatures[0],
			controlSignatures,
			controlVaried: new Set(controlSignatures).size > 1
		};
	}

	/**
	 * ATC TM-664: un término sin resultados muestra un estado vacío CONTROLADO — HTTP 200 con
	 * array vacío, nunca 404 ni error envelope. Sirve también para los términos bajo el mínimo.
	 */
	@atc('TM-664', { description: 'término sin resultados → estado vacío controlado (200 + [])' })
	async assertControlledEmptyState(term: string, origin?: Coordinates | null): Promise<APIResponse> {
		const res = await this.autocomplete({ address: term, origin });
		expect(res.status(), `"${term}" sin resultados no debe 5xx`).not.toBe(500);
		expect(res.status(), `"${term}" sin resultados debe ser 200 controlado, nunca 404`).toBe(200);
		const list = await expectArray<AutocompletePrediction>(res);
		expect(list, `"${term}" debe devolver un array vacío, no un error envelope`).toHaveLength(0);
		return res;
	}

	// ── MG-116 · App PAX — sólo lo que de ese ticket es un hecho del RESPONSE ────────────────
	//
	// Baja acá únicamente lo verificable sin cliente. La suite anterior (`tests/features/mg116/api/`
	// en magiis-playwright, retirada el 2026-08-22) declaraba cubiertos cinco casos más con un
	// assert de "las 9 claves del contrato" que NO ejerce ninguno de ellos:
	//   TM-676 — que la lista se RENDERICE con mainText/secondaryText/shortName → pantalla.
	//   TM-677 — que al elegir una predicción el alta de viaje CONTINÚE → flujo, pantalla.
	//   TM-683 — el ícono diferenciado → pantalla (que el IATA resuelva ya lo cubre TM-659 acá).
	//   TM-684 — que un placeId nulo SE RESUELVA → pantalla (que exista ya lo cubre TM-660 acá).
	//   TM-691 — que una fila de cache con airport=true no se RENDERICE como aeropuerto → pantalla.
	// Acreditar esos IDs desde acá inflaba la cobertura: Xray los mostraba verdes sin verificarlos.

	/**
	 * ATC TM-727: una dirección de cache cercana al usuario no debe rankear por detrás de
	 * aeropuertos que matchean por NOMBRE y están a miles de kilómetros.
	 *
	 * ES EL CRITERIO DE CIERRE DE MG-931, no documentación: hoy está en ROJO a propósito. Cuando
	 * entren CA-03 / CA-33 debe pasar a verde SIN tocar el test — y mientras falle, el mensaje dice
	 * exactamente qué filas rankearon y con qué `source`, que es lo que hace auditable el reporte.
	 */
	@atc('TM-727', {
		description: 'las direcciones de cache cercanas no rankean detrás de aeropuertos lejanos matcheados por nombre'
	})
	async assertNearbyCacheOutranksDistantAirports(
		term: string,
		origin: Coordinates
	): Promise<[APIResponse, AutocompletePrediction[]]> {
		precondition(
			term.length >= 4,
			`"${term}" debe tener 4+ caracteres: por debajo el backend no consulta aeropuertos por nombre y el defecto no es observable`
		);

		const res = await this.autocomplete({ address: term, origin });
		expect(res.status(), `autocomplete("${term}") con origen debe responder 200`).toBe(200);
		const list = await expectArray<AutocompletePrediction>(res);
		this.assertPredictionShape(list, `orden term="${term}"`);
		this.assertNonEmpty(list, `orden term="${term}"`, 'sin filas no hay orden que evaluar');

		const { firstCacheIndex, airportsAhead } = airportsBeforeFirstCache(list);
		expect(
			firstCacheIndex,
			`ninguna fila source=CACHE para "${term}": el orden no se puede evaluar, y un verde acá no probaría nada`
		).toBeGreaterThanOrEqual(0);

		expect(
			airportsAhead,
			`${airportsAhead} aeropuerto(s) rankean antes de la primera dirección de cache (índice ${firstCacheIndex}). ` +
				`Filas: ${list
					.slice(0, firstCacheIndex + 1)
					.map((r) => `${r.source}:${r.mainText}`)
					.join(' | ')}`
		).toBe(0);

		return [res, list];
	}

	/**
	 * Medición de la calidad del dato que la cache expone — SIN key de Xray, a propósito.
	 *
	 * No acredita ningún caso: es la línea base cuantitativa que MG-931 necesita para saber si su
	 * fix funcionó (CA-33 plus codes, CA-34 duplicados). Prestarle el ID de otro caso para que
	 * "figure cubierto" sería exactamente el error que este port vino a corregir.
	 */
	async measureCacheDataQuality(
		term: string,
		origin?: Coordinates | null
	): Promise<{ total: number; plusCodes: number; duplicatePairs: number; cacheFlaggedAirport: number }> {
		const res = await this.autocomplete({ address: term, origin });
		expect(res.status(), `la medición de calidad para "${term}" debe responder 200`).toBe(200);
		const list = await expectArray<AutocompletePrediction>(res);

		const porTexto = new Map<string, number>();
		for (const r of list) porTexto.set(r.mainText, (porTexto.get(r.mainText) ?? 0) + 1);

		return {
			total: list.length,
			plusCodes: list.filter((r) => isPlusCode(r.mainText)).length,
			duplicatePairs: [...porTexto.values()].filter((n) => n > 1).length,
			cacheFlaggedAirport: list.filter((r) => r.source === 'CACHE' && r.airport === true).length
		};
	}
}
