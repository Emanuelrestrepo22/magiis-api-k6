// tests/specs/_flows/mg-117-places-autocomplete.api.test.ts
// MG-117 — App Driver migra el autocompletado de direcciones desde llamadas directas a Google
// Places hacia el endpoint propio del backend MAGIIS. Pata API del ticket.
// Backend correspondiente: MG-118, productivo desde v1.72.8 → el endpoint es consultable hoy.
//
// TRAZABILIDAD (Xray Tests del proyecto TM — MG-117 es la Story, NO un Test):
//   TM-651 · el request lleva address + coordenadas del origen, y NO lleva radius ni language
//   TM-658 · con 4+ caracteres la respuesta combina aeropuertos por nombre + direcciones de cache
//   TM-659 · un código IATA de 3 letras devuelve el aeropuerto con su icono diferenciado
//   TM-660 · una predicción de aeropuerto con placeId nulo se resuelve sin romper el flujo
//   TM-661 · la búsqueda por código IATA no aplica sesgo por ubicación
//   TM-664 · un término sin resultados muestra un estado vacío controlado
// Las keys van declaradas con @atc en el componente (tests/components/api/PlacesApi.ts); este spec
// solo orquesta los ATCs. El binding type:'tms' lo empuja el decorador.
//
// CONTRATO: GET places/autocomplete — medido en vivo sobre el endpoint real (uat, prefijo
// magiis-v0.2; uat es el ambiente por default del repo y TEST está fuera de alcance).
// El detalle del contrato y las 4 desviaciones respecto del AC están documentadas
// en la cabecera de tests/components/api/PlacesApi.ts (fuente de verdad de este spec).
// Resumen de desviaciones: el campo es `airport` (no `isAirport`) · `radius`/`language` NO se
// reciben (se ignoran en silencio) · `placeId` sí llega null en aeropuertos · existe un tercer
// `source` = GOOGLE con latitude/longitude null.
//
// DECISIONES DE TOLERANCIA (para no romper por datos del ambiente):
//   1. Comparación de respuestas por FIRMA orden-insensible (source|mainText|iataCode), nunca por
//      md5 del body: el orden del result set puede variar sin que cambie el contrato.
//   2. Nunca se asserta un tamaño máximo del result set (se observaron 0..10, sin cota probada).
//   3. Nunca se asserta que las coordenadas vengan no-nulas: source=GOOGLE las devuelve null.
//   4. Los statuses se assertan EXACTOS, sin rangos tolerantes: 200 en las lecturas y 400 en la
//      llamada sin `address`. Un 403 (token vencido) o un 404 (ruta movida) deben FALLAR — la
//      tolerancia anterior [200,400,403,404] convertía un fallo de auth en un skip verde.
//   5. El origen NO está hardcodeado: se deriva en runtime del propio endpoint (coordenadas del
//      aeropuerto resuelto por IATA). Este endpoint no recibe ids, así que no consume cfg.carrierId.
//
// ANTI-FALSE-GREEN (regla del repo: un test que pasa con un array vacío es un defecto):
//   - toda comparación de firmas exige antes que las listas comparadas tengan filas: con `[]` la
//     firma es '' y comparar dos vacíos es '' === '' → verde que no verificó nada;
//   - TM-651 verifica las dos mitades del contrato de forma simétrica: el origen debe CAMBIAR el
//     set y radius/language/sessionToken deben DEJARLO IGUAL;
//   - las validaciones de longitud del argumento (3 chars / 4+ chars) son PRECONDICIONES que lanzan,
//     no aserciones: assertear sobre el literal que este spec acaba de pasar es una tautología;
//   - TM-658-AEROPUERTO-NOMBRE exige `source=AIRPORT` explícito: `source==='AIRPORT' || airport===true`
//     se satisface con una sola fila CACHE, sin ninguna resolución por nombre de aeropuerto;
//   - TM-658-MAPEO-ALTURA compara la altura como NÚMERO (`\b500\b`): `includes('500')` acepta 1500 /
//     2500 / 5000, así que una altura equivocada del backend daba verde.
//
// GUARDAS (nunca fallar por configuración ausente — pero jamás tapar un fallo real):
//   - sin LOGIN_USER/LOGIN_PASSWORD → skip del describe completo;
//   - origen no derivable en el ambiente → test.skip con motivo.
// NO son guardas (se assertan, porque son hechos del sistema, no configuración del runner):
//   - TM-660 sin ninguna fila con placeId nulo → FALLA dentro del ATC (assertNonEmpty);
//   - TM-661 con el término de control invariante → FALLA (mismo hecho que TM-651 asserta duro).
//
// PROHIBIDO en este spec (reglas del repo): mocks HTTP, llamar a Google Places directamente
// (docs/SCOPE.md inmutable #5 — las integraciones externas se prueban a través del backend),
// waitForTimeout, e ids hardcodeados.

import { test, expect } from '@TestBase';
import type { Coordinates } from '@api/PlacesApi';

const HAS_CREDS = Boolean(process.env.LOGIN_USER && process.env.LOGIN_PASSWORD);

// Términos del plan de pruebas de MG-117 (datos, no ids: el endpoint no recibe identificadores).
const TERM = {
	/** Bajo el mínimo de caracteres → estado vacío controlado. */
	belowMinimum: ['e', 'ez'],
	/** IATA exacto (3 chars) → único match de aeropuerto. */
	iataExact: 'eze',
	/** IATA con icono de aeropuerto diferenciado. */
	iataAirportIcon: 'aep',
	/** 4 chars del plan: devuelve direcciones de cache con la señal `airport` embebida. */
	fourChars: 'ezei',
	/**
	 * 4 chars agregado por medición: `ezei` NO ejerce source=AIRPORT (solo CACHE), así que la
	 * combinación "aeropuertos por NOMBRE + direcciones" solo es observable con un prefijo de
	 * nombre de aeropuerto. `corr` devuelve 2 filas AIRPORT por nombre + 8 CACHE.
	 */
	fourCharsAirportByName: 'corr',
	/** Direcciones (cache). */
	addresses: ['corrientes', 'av corrientes'],
	/** Mapeo de dirección con altura. */
	addressMapping: 'san martin 500',
	/** Sin resultados → estado vacío controlado. */
	noResults: 'zzzqqqxxx',
	/**
	 * Términos donde se midieron predicciones de aeropuerto con placeId nulo.
	 *
	 * ⚠ DATOS OPORTUNISTAS DEL AMBIENTE — igual que `corr`, los tres términos dependen del catálogo
	 * de aeropuertos y del CACHE de direcciones de uat, no de un fixture propio. Es la fuente de
	 * flake más probable de todo el spec: si el cache cambia y el barrido no produce ninguna fila con
	 * placeId nulo, el ATC FALLA (assertNonEmpty) — el criterio no queda ejercido y eso es un
	 * hallazgo que hay que mirar, nunca un skip ni un verde vacío.
	 * `san` y `usu` son de 3 chars → entran por match exacto de IATA (SAN, USU), no por dirección.
	 */
	nullPlaceIdSweep: ['corr', 'san', 'usu'],
	/** IATAs usados para derivar orígenes reales (CABA y Mendoza) sin hardcodear coordenadas. */
	originAirports: ['eze', 'mdz']
} as const;

test.describe('[_flows] MG-117 — places/autocomplete (App Driver)', () => {
	test.skip(!HAS_CREDS, 'Faltan credenciales: LOGIN_USER + LOGIN_PASSWORD en .env.<env>.');

	// ── TM-651 · contrato del request ─────────────────────────────────────────────────────
	test('TM-651-CONTRATO · address + el origen SESGA el resultado; radius/language/sessionToken se ignoran', async ({
		placesApi,
		cfg
	}) => {
		const origin = await placesApi.resolveAirportOrigin(TERM.iataExact);
		test.skip(
			origin === null,
			`No se pudo derivar un origen real desde el endpoint (IATA "${TERM.iataExact}" sin coordenadas en ${cfg.env}).`
		);

		const [res, list] = await placesApi.assertRequestContract(TERM.addresses[0], origin!);
		console.log(
			`[MG-117][TM-651] ${cfg.env} · address+origen(${origin!.latitude},${origin!.longitude}) → ${res.status()} · ${list.length} predicciones`
		);
	});

	// ── TM-658 · 4+ caracteres: aeropuertos por nombre + direcciones de cache ─────────────
	// Los TÍTULOS dicen exactamente qué verifica cada subcaso. Solo AEROPUERTO-NOMBRE ejerce la
	// COMBINACIÓN de fuentes del criterio de TM-658: es el único término medido que devuelve
	// source=AIRPORT y source=CACHE en la misma respuesta. Los demás cubren la otra mitad del
	// criterio (con 4+ chars el backend resuelve direcciones del cache) y se titulan como
	// caracterización de la fuente de datos, con la ausencia de pata de aeropuerto asertada.
	type MultiSourceCase = {
		subcase: string;
		term: string;
		expectAirportSignal: boolean;
		/** Qué verifica el subcaso — va al título del test, no puede prometer más que sus asserts. */
		title: string;
		note: string;
		/** Cuando está presente, se asserta el mapeo del texto devuelto (calle normalizada + altura). */
		mapping?: { street: string; number: string };
	};

	const multiSourceCases: MultiSourceCase[] = [
		{
			subcase: 'AEROPUERTO-NOMBRE',
			term: TERM.fourCharsAirportByName,
			expectAirportSignal: true,
			title: 'combina aeropuertos por nombre (source=AIRPORT) con direcciones de cache',
			note: 'prefijo de NOMBRE de aeropuerto: única forma medida de observar source=AIRPORT + CACHE juntos'
		},
		{
			subcase: 'CACHE',
			term: TERM.fourChars,
			expectAirportSignal: false,
			title: 'devuelve solo direcciones de cache, sin pata de aeropuerto [caracterización]',
			note: 'término del plan: devuelve solo source=CACHE, ninguna fila con airport=true'
		},
		{
			subcase: 'DIRECCION',
			term: TERM.addresses[0],
			expectAirportSignal: false,
			title: 'devuelve solo direcciones de cache, sin pata de aeropuerto [caracterización]',
			note: 'dirección simple del cache'
		},
		{
			subcase: 'DIRECCION-PREFIJADA',
			term: TERM.addresses[1],
			expectAirportSignal: false,
			title: 'con prefijo de tipo de vía devuelve solo direcciones de cache [caracterización]',
			note: 'dirección con prefijo de tipo de vía'
		},
		{
			subcase: 'MAPEO-ALTURA',
			term: TERM.addressMapping,
			expectAirportSignal: false,
			title: 'mapea a la dirección normalizada conservando la altura',
			note: 'dirección con altura: el backend normaliza la calle (acentos/capitalización) y conserva la altura',
			// Medido en uat: "san martin 500" → mainText "San Martín 500, C1054 CABA, Argentina".
			mapping: { street: 'san martin', number: '500' }
		}
	];

	/** Normaliza acentos + caja para comparar el texto devuelto contra el término consultado. */
	const normalize = (value: string): string =>
		value
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase();

	/**
	 * La altura debe coincidir COMO NÚMERO, no como substring: `includes('500')` acepta 1500, 2500 y
	 * 5000 (medido), así que una altura equivocada devuelta por el backend seguía dando verde. Se
	 * comparan los números del texto contra el pedido, y `\b` evita el match parcial dentro de otro
	 * número. Códigos postales como "C1054" no aportan un token numérico que colisione con "500".
	 */
	const keepsHouseNumber = (text: string, houseNumber: string): boolean =>
		new RegExp(`\\b${houseNumber}\\b`).test(text);

	for (const testCase of multiSourceCases) {
		test(`TM-658-${testCase.subcase} · "${testCase.term}" ${testCase.title}`, async ({ placesApi, cfg }) => {
			const [res, list] = await placesApi.assertMultiSourceSearch({
				term: testCase.term,
				expectAirportSignal: testCase.expectAirportSignal
			});

			// El subcaso de mapeo tiene que assertar el mapeo, no solo que hubo respuesta: la
			// dirección normalizada debe conservar la calle consultada y la altura pedida.
			if (testCase.mapping) {
				const { street, number } = testCase.mapping;
				const mapped = list.filter(
					(p) => normalize(p.mainText).includes(normalize(street)) && keepsHouseNumber(p.mainText, number)
				);
				expect(
					mapped.map((p) => p.mainText),
					`"${testCase.term}" debe mapear a una dirección normalizada que conserve la calle "${street}" y la altura ${number}`
				).not.toHaveLength(0);
			}

			const bySource = list.reduce<Record<string, number>>((acc, p) => {
				acc[p.source] = (acc[p.source] ?? 0) + 1;
				return acc;
			}, {});
			console.log(
				`[MG-117][TM-658][${testCase.subcase}] ${cfg.env} · "${testCase.term}" → ${res.status()} · ` +
					`${list.length} predicciones ${JSON.stringify(bySource)} · airport=true: ${list.filter((p) => p.airport).length} · ${testCase.note}`
			);
		});
	}

	// ── TM-659 · IATA de 3 letras → aeropuerto con icono diferenciado ─────────────────────
	for (const iata of [TERM.iataExact, TERM.iataAirportIcon]) {
		test(`TM-659-IATA-${iata.toUpperCase()} · devuelve el aeropuerto con su señal de icono`, async ({
			placesApi,
			cfg
		}) => {
			const [res, airport] = await placesApi.assertIataExactReturnsAirport(iata);
			console.log(
				`[MG-117][TM-659] ${cfg.env} · "${iata}" → ${res.status()} · ${airport.mainText} · ` +
					`iataCode=${airport.iataCode} airport=${String(airport.airport)} placeId=${airport.placeId ?? 'null'}`
			);
			// La señal de icono es del lado del cliente: el payload NO trae campo icon/iconUrl.
			expect(airport.airport, 'la señal para el icono diferenciado es `airport=true`').toBe(true);
		});
	}

	// ── TM-660 · placeId nulo en predicciones de aeropuerto ──────────────────────────────
	test('TM-660-PLACEID-NULO · una predicción de aeropuerto sin placeId se resuelve sin romper', async ({
		placesApi,
		cfg
	}) => {
		// El criterio de no-vacuidad del barrido vive DENTRO del ATC (assertNonEmpty sobre las filas
		// con placeId nulo): si ningún término produce una fila nula, el ATC falla ahí. Antes ese
		// criterio estaba acá como `test.skip(nullRows.length === 0)` — degradación a skip, y el ATC
		// quedaba dando verde vacío para cualquier otro spec que lo invocara.
		const nullRows = await placesApi.assertNullPlaceIdIsResolvable([...TERM.nullPlaceIdSweep]);
		console.log(
			`[MG-117][TM-660] ${cfg.env} · barrido ${TERM.nullPlaceIdSweep.join('/')} → ${nullRows.length} filas con placeId nulo: ` +
				nullRows.map((p) => `${p.iataCode ?? '-'}:${p.mainText}`).join(' | ')
		);
	});

	// ── TM-661 · la búsqueda por IATA no aplica sesgo por ubicación ──────────────────────
	test('TM-661-SIN-SESGO · el IATA devuelve lo mismo con y sin coordenadas del origen', async ({ placesApi, cfg }) => {
		const origins: Coordinates[] = [];
		for (const iata of TERM.originAirports) {
			const origin = await placesApi.resolveAirportOrigin(iata);
			if (origin) origins.push(origin);
		}
		test.skip(
			origins.length === 0,
			`No se pudo derivar ningún origen real desde el endpoint (IATAs ${TERM.originAirports.join(', ')}) en ${cfg.env}.`
		);

		const result = await placesApi.assertIataSearchIgnoresLocationBias({
			iata: TERM.iataExact,
			controlTerm: TERM.addresses[0],
			origins
		});
		console.log(
			`[MG-117][TM-661] ${cfg.env} · IATA "${TERM.iataExact}" invariante sobre ${origins.length + 1} orígenes · ` +
				`control "${TERM.addresses[0]}" varió: ${String(result.controlVaried)}`
		);
		// Si la dirección de control tampoco varía, el mecanismo de sesgo no es observable y el verde
		// de "sin sesgo" sería vacío. Se ASSERTA: es el MISMO hecho que TM-651 asserta duro sobre el
		// mismo término ("corrientes" debe sesgar con el origen). No puede ser assert allá y skip acá.
		expect(
			result.controlVaried,
			`El término de control "${TERM.addresses[0]}" debe variar entre orígenes en ${cfg.env}: si deja de variar, el sesgo por ubicación ya no es observable (el mismo hecho que TM-651 asserta duro) y "sin sesgo" no queda demostrado.`
		).toBe(true);
	});

	// ── TM-664 · estado vacío controlado ─────────────────────────────────────────────────
	test(`TM-664-VACIO · "${TERM.noResults}" devuelve un estado vacío controlado (200 + [])`, async ({
		placesApi,
		cfg
	}) => {
		const res = await placesApi.assertControlledEmptyState(TERM.noResults);
		console.log(`[MG-117][TM-664] ${cfg.env} · "${TERM.noResults}" → ${res.status()} + []`);
	});

	for (const term of TERM.belowMinimum) {
		test(`TM-664-BAJO-MINIMO-${term.length} · "${term}" no dispara error, devuelve vacío controlado`, async ({
			placesApi,
			cfg
		}) => {
			const res = await placesApi.assertControlledEmptyState(term);
			console.log(
				`[MG-117][TM-664] ${cfg.env} · "${term}" (${term.length} char) → ${res.status()} + [] ` +
					'(la regla de longitud mínima se expresa como CONTENIDO, no como 400)'
			);
		});
	}

	// ── PATA DB · el campo `source` dice la verdad ────────────────────────────────────────
	//
	// Es la verificación que ningún eje da solo. El modelo de ahorro de la épica MG-112 se apoya
	// entero en `source`: una fila CACHE no le cuesta nada a la empresa, una GOOGLE sí. Si el
	// backend etiquetara mal, el tablero mostraría un ahorro que no existe y NADIE se enteraría —
	// la respuesta de la API es idéntica en forma para ambos casos.
	//
	// Contrastar contra MAGIIS_PLACE (la tabla de caché real, 141k filas, índice Oracle Text sobre
	// FORMATTED_ADDRESS) convierte esa etiqueta en algo falsable:
	//   source=CACHE  → la fila DEBE existir, con las mismas coordenadas que devolvió la API
	//   source=GOOGLE → la fila NO debe existir (vino de afuera, por eso se paga)
	//
	// MEDIDO ANTES DE ESCRIBIR ESTO (no asumido):
	//   · `places/autocomplete` NO escribe en MAGIIS_PLACE — 4 términos que devolvieron GOOGLE
	//     dejaron el conteo intacto y sus placeId siguen sin fila. La escritura pertenece al flujo
	//     de SELECCIÓN, no al de búsqueda. Por eso esta aserción es de LECTURA y es determinista.
	//   · El `sessionToken` DEBE ser un UUID v4: un valor no vacío mal formado hace que el backend
	//     devuelva lista vacía con HTTP 200 y suprima la pata de Google en silencio.
	test('DB-SOURCE-VERAZ · las filas CACHE existen en MAGIIS_PLACE y las GOOGLE no', async ({ placesApi, db, cfg }) => {
		// Skip declarado: sin credenciales Oracle este caso NO se ejerce. Callarlo lo dejaría verde
		// sin haber verificado nada, que es justo el falso verde que esta pata viene a cerrar.
		test.skip(!db, 'Sin credenciales Oracle: la pata DB no es verificable (definí ORACLE_* en .env.<env>).');

		const existsInCache = async (placeId: string): Promise<boolean> => {
			const rows = await db!.query<{ N: number }>('SELECT COUNT(*) AS n FROM magiis_place WHERE place_id = :p', {
				p: placeId
			});
			return (rows[0]?.N ?? 0) > 0;
		};

		// ── 1. Las predicciones de CACHÉ deben tener respaldo en la tabla ────────────────
		const cacheRes = await placesApi.autocomplete({ address: TERM.addresses[0] });
		expect(cacheRes.status(), `"${TERM.addresses[0]}" debe responder 200`).toBe(200);
		const cacheList = (await cacheRes.json()) as Array<{
			placeId: string | null;
			mainText: string;
			source: string;
			latitude: string | null;
			longitude: string | null;
		}>;

		const cached = cacheList.filter((p) => p.source === 'CACHE' && p.placeId);
		expect(
			cached.length,
			`"${TERM.addresses[0]}" no devolvió ninguna fila source=CACHE en ${cfg.env}: sin filas de caché ` +
				'este caso no puede demostrar nada y un verde sería vacío.'
		).toBeGreaterThan(0);

		const huerfanas: string[] = [];
		for (const p of cached) {
			if (!(await existsInCache(p.placeId!)))
				huerfanas.push(`${p.mainText.slice(0, 40)} (${p.placeId!.slice(0, 18)}…)`);
		}
		expect(
			huerfanas,
			`El endpoint marcó como CACHE filas que NO están en MAGIIS_PLACE. La etiqueta miente: se ` +
				`contarían como ahorro consultas que en realidad se pagaron. Huérfanas: ${huerfanas.join(' | ')}`
		).toEqual([]);

		// Las coordenadas también deben coincidir: una fila presente con otros datos es igual de
		// mentirosa que una ausente.
		const primera = cached[0];
		const fila = await db!.query<{ LATITUDE: string; LONGITUDE: string; SHORT_NAME: string }>(
			'SELECT latitude, longitude, short_name FROM magiis_place WHERE place_id = :p',
			{ p: primera.placeId! }
		);
		expect(fila.length, 'la fila de control debe existir').toBeGreaterThan(0);
		if (primera.latitude != null) {
			expect(
				Number.parseFloat(String(fila[0].LATITUDE)),
				`La latitud de la API (${primera.latitude}) no coincide con la de MAGIIS_PLACE (${fila[0].LATITUDE}) ` +
					`para "${primera.mainText.slice(0, 40)}".`
			).toBeCloseTo(Number.parseFloat(String(primera.latitude)), 4);
		}

		// ── 2. Las predicciones de GOOGLE NO deben estar en la caché ─────────────────────
		// Si estuvieran, el backend estaría pagando a Google por algo que ya tenía guardado —
		// exactamente el desperdicio que la épica MG-112 viene a eliminar.
		const novel = 'Sobremonte 1459';
		const googleRes = await placesApi.autocomplete({ address: novel });
		expect(googleRes.status(), `"${novel}" debe responder 200`).toBe(200);
		const googleList = (await googleRes.json()) as Array<{ placeId: string | null; mainText: string; source: string }>;
		const fromGoogle = googleList.filter((p) => p.source === 'GOOGLE' && p.placeId);

		test.skip(
			fromGoogle.length === 0,
			`"${novel}" ya no devuelve filas source=GOOGLE en ${cfg.env} (probablemente quedó cacheada). ` +
				'Hace falta un término aún no cacheado para ejercer esta mitad.'
		);

		const yaCacheadas: string[] = [];
		for (const p of fromGoogle) {
			if (await existsInCache(p.placeId!)) yaCacheadas.push(`${p.mainText.slice(0, 40)} (${p.placeId!.slice(0, 18)}…)`);
		}
		expect(
			yaCacheadas,
			`El endpoint fue a Google por direcciones que YA estaban en MAGIIS_PLACE: se está pagando ` +
				`por datos ya guardados. Filas: ${yaCacheadas.join(' | ')}`
		).toEqual([]);

		console.log(
			`[MG-117][DB] ${cfg.env} · source verificado contra MAGIIS_PLACE: ` +
				`${cached.length} CACHE con respaldo · ${fromGoogle.length} GOOGLE sin fila previa`
		);
	});
});
