// k6/lib/config.js
// Fuente de verdad para env, credenciales, IDs y URL del backend Magiis en el
// subproyecto de performance (k6). Reusa la misma convención de env vars que el
// suite Playwright (BASE_URL, MAGIIS_API_PREFIX, LOGIN_*, MAGIIS_TEST_*).
//
// Los scripts k6 corren como binario standalone: NO hay Node APIs disponibles.
// Las env vars se leen con `__ENV` (no `process.env`).

// Lee una env var con `__ENV`; devuelve el default si viene vacía o ausente.
function readEnv(key, fallback) {
	const v = __ENV[key];
	if (v === undefined || v === null) return fallback;
	const trimmed = String(v).trim();
	return trimmed === '' ? fallback : trimmed;
}

// Lee una env var entera; usa el fallback si no parsea a número válido.
function readIntEnv(key, fallback) {
	const raw = readEnv(key, undefined);
	if (raw === undefined) return fallback;
	const n = parseInt(raw, 10);
	return Number.isNaN(n) ? fallback : n;
}

// Base URL sin barras finales (ej. https://apps-test.example.com).
const BASE_URL = readEnv('BASE_URL', 'https://apps-test.example.com').replace(/\/+$/, '');

// Prefijo de la API sin barras al inicio/fin (ej. magiis-v0.2).
// Clave AUSENTE → default 'magiis-v0.2' (test/uat). Clave PRESENTE aunque vacía → respetar:
// PROD usa host api.apps.example.com SIN prefijo de versión (MAGIIS_API_PREFIX=).
const RAW_PREFIX = __ENV['MAGIIS_API_PREFIX'];
const MAGIIS_API_PREFIX = (RAW_PREFIX === undefined ? 'magiis-v0.2' : String(RAW_PREFIX)).replace(/^\/+|\/+$/g, '');

// Credenciales y rol de login (mismo contrato que el suite Playwright).
const LOGIN_USER = readEnv('LOGIN_USER', '');
const LOGIN_PASSWORD = readEnv('LOGIN_PASSWORD', '');
const LOGIN_ROLE = readEnv('LOGIN_ROLE', 'ROLE_CARRIER');

// IDs de prueba conocidos en TEST.
const CARRIER_ID = readIntEnv('MAGIIS_TEST_CARRIER_ID', 1040);
const DRIVER_ID = readIntEnv('MAGIIS_TEST_DRIVER_ID', 1203);

export const config = {
	baseUrl: BASE_URL,
	magiisPrefix: MAGIIS_API_PREFIX,
	loginUser: LOGIN_USER,
	loginPassword: LOGIN_PASSWORD,
	loginRole: LOGIN_ROLE,
	carrierId: CARRIER_ID,
	driverId: DRIVER_ID
};

// Construye la URL completa: {baseUrl}/{prefix}/{path}, normalizando barras.
// `path` puede incluir query string (ej. 'resource/{id}/items/paginated?page=1').
export function buildUrl(path) {
	const clean = String(path).replace(/^\/+/, '');
	return `${config.baseUrl}/${config.magiisPrefix}/${clean}`.replace(/([^:])\/\/+/g, '$1/');
}
