// tests/specs/_flows/mg-116-places-autocomplete.api.test.ts
// MG-116 — App PAX migra el autocompletado de direcciones al endpoint propio.
//
// QUÉ HACE ESTE SPEC Y QUÉ NO. Es la contraparte de `mg-116` del spec de MG-117 que vive al lado:
// mismo endpoint, mismo backend (MG-118), distinto cliente. Sólo baja acá lo que es un hecho del
// RESPONSE. Lo que depende de la conducta del CLIENTE — debounce, quién manda el sesgo, el
// sessionToken, el piso de caracteres — se queda en la suite Appium de magiis-playwright: si el
// test construye el request, asertar que "el request lleva el sesgo" no prueba nada del producto.
//
// TRAZABILIDAD — leer antes de agregar un caso acá.
//   TM-727 · único Test de MG-116 que este spec acredita. Es una aserción sobre el ORDEN de la
//            respuesta, así que es verificable sin cliente.
// Los otros cinco casos que la suite anterior (`tests/features/mg116/api/` en magiis-playwright,
// retirada el 2026-08-22) declaraba cubiertos NO lo estaban — un assert de "las 9 claves del
// contrato" no ejerce ninguno de ellos, y Xray los mostraba verdes:
//   TM-676 (render de la lista) · TM-677 (el alta de viaje continúa) · TM-683 (ícono diferenciado)
//   TM-684 (un placeId nulo SE RESUELVE) · TM-691 (una fila de cache con airport=true no se
//   renderiza como aeropuerto). Los cinco son de PANTALLA y su lugar es la suite de dispositivo.
// Sus mitades de API que sí existen ya están cubiertas por los ATC de MG-117 en este mismo repo:
// que el IATA resuelva un aeropuerto es TM-659, y que existan filas con placeId nulo es TM-660.
//
// ORIGEN. Se deriva del endpoint (IATA → coordenadas) en vez de hardcodearlo, igual que el spec de
// MG-117. La campaña midió con Reconquista 661 (CABA); EZE está a unos 30 km, dentro de la misma
// región, y el defecto de orden que TM-727 caza es de 785 km — observable con cualquiera de los dos.

import { test, expect } from '@TestBase';

const HAS_CREDS = Boolean(process.env.LOGIN_USER && process.env.LOGIN_PASSWORD);

/**
 * `corr` es el término medido en toda la campaña de MG-116 y el único que ejerce el defecto: con
 * 4 caracteres matchea aeropuertos por NOMBRE (Corrado Gex · AOT, Corryong · CYG) además de
 * direcciones de Corrientes en CABA. Con 3 caracteres el backend sólo hace match exacto por IATA
 * y el defecto no aparece; con `puerto` / `aero` / `port` tampoco (medido — es el hueco que se
 * reportó en el AC de No regresión de MG-931).
 */
const TERM_ORDEN = 'corr';

/** IATA desde el que se deriva un origen real en la región de Buenos Aires. */
const ORIGIN_IATA = 'eze';

/**
 * `corri` es el término que en producción devolvió 8 de 8 plus codes con un par duplicado a 1 metro.
 * Se re-mide acá contra UAT para tener la línea base de MG-931 en los dos ambientes.
 */
const TERM_CALIDAD = 'corri';

test.describe('[_flows] MG-116 — places/autocomplete (App PAX)', () => {
	test.skip(!HAS_CREDS, 'Faltan credenciales: LOGIN_USER + LOGIN_PASSWORD en .env.<env>.');

	// ── TM-727 · orden: cercanas de cache por delante de aeropuertos lejanos ──────────────
	//
	// ESTÁ EN ROJO A PROPÓSITO. Es el criterio de cierre de MG-931 (CA-03), no documentación:
	// cuando el fix entre debe pasar a verde SIN tocar este archivo.
	test('TM-727-ORDEN · las direcciones de cache cercanas no rankean detrás de aeropuertos lejanos', async ({
		placesApi,
		cfg
	}) => {
		const origin = await placesApi.resolveAirportOrigin(ORIGIN_IATA);
		test.skip(
			origin === null,
			`No se pudo derivar un origen real del endpoint (IATA "${ORIGIN_IATA}" sin coordenadas en ${cfg.env}).`
		);

		const [res, list] = await placesApi.assertNearbyCacheOutranksDistantAirports(TERM_ORDEN, origin!);
		console.log(
			`[MG-116][TM-727] ${cfg.env} · "${TERM_ORDEN}" origen(${origin!.latitude},${origin!.longitude}) → ` +
				`${res.status()} · ${list.length} predicciones · ${list.filter((r) => r.airport).length} con airport=true`
		);
	});

	// ── Línea base de calidad del dato — SIN key de Xray ──────────────────────────────────
	//
	// No acredita ningún caso de MG-116: el alcance de este ticket es el endpoint propio, no la
	// limpieza de la cache. Eso es MG-931 (CA-33 plus codes, CA-34 duplicados). Poner un assert
	// duro acá pintaría de rojo a MG-116 por un defecto que no es suyo; ponerle el ID de otro caso
	// para que "figure cubierto" sería peor. Se deja el número medido y auditable en el reporte.
	test('CALIDAD-CACHE · cuántos plus codes y duplicados expone la cache [medición, sin veredicto]', async ({
		placesApi,
		cfg
	}) => {
		const origin = await placesApi.resolveAirportOrigin(ORIGIN_IATA);
		const m = await placesApi.measureCacheDataQuality(TERM_CALIDAD, origin);

		test.info().annotations.push({
			type: 'medicion',
			description:
				`"${TERM_CALIDAD}" en ${cfg.env}: ${m.total} predicciones · ${m.plusCodes} plus codes · ` +
				`${m.duplicatePairs} texto(s) duplicado(s) · ${m.cacheFlaggedAirport} fila(s) CACHE con airport=true`
		});
		console.log(
			`[MG-116][CALIDAD-CACHE] ${cfg.env} · "${TERM_CALIDAD}" → ${m.total} filas · ` +
				`plusCodes=${m.plusCodes} · duplicados=${m.duplicatePairs} · cacheComoAeropuerto=${m.cacheFlaggedAirport}`
		);

		// Lo único que se asierta es que la medición sea interpretable: sin filas no hay línea base,
		// y un verde con 0 filas diría "no hay plus codes" cuando en realidad no se midió nada.
		expect(m.total, `"${TERM_CALIDAD}" no devolvió predicciones: no hay línea base que registrar`).toBeGreaterThan(0);
	});
});
