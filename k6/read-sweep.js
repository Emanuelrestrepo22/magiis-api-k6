// k6/read-sweep.js
// Backlog C: barrido read-only de todos los GET parametrizables por {carrierId}
// (o sin path param) derivados de openapi.yaml. La lista NO está hardcodeada:
// se genera con `npm run k6:gen-endpoints` -> k6/lib/endpoints.generated.json.
//
// Objetivo: confirmar que ningún endpoint de lectura devuelve 5xx bajo 1 VU.
// Es un sweep de humo amplio, no una prueba de carga (1 VU, 1 iteración).
//
// Ejecución (OPT-IN, solo con luz verde del QA Lead — ver k6/README.md):
//   npm run k6:gen-endpoints   # regenera la lista desde el spec (Node)
//   npm run k6:sweep           # corre este script (k6)   ->  k6 run k6/read-sweep.js
//
// Env vars: ver k6/lib/config.js (BASE_URL, MAGIIS_API_PREFIX, LOGIN_*, MAGIIS_TEST_*).

import http from 'k6/http';
import { check, group } from 'k6';
import { config, buildUrl } from './lib/config.js';
import { login, authHeaders } from './lib/auth.js';
// k6 permite importar JSON directamente (se resuelve en build time).
import endpoints from './lib/endpoints.generated.json';

export const options = {
	vus: 1,
	iterations: 1,
	thresholds: {
		http_req_duration: ['p(95)<800'],
		http_req_failed: ['rate<0.05']
	}
};

// setup() corre una sola vez; el token se comparte a la (única) iteración.
export function setup() {
	if (!Array.isArray(endpoints) || endpoints.length === 0) {
		throw new Error('endpoints.generated.json vacío o inválido. Corré `npm run k6:gen-endpoints` antes del sweep.');
	}
	const token = login();
	return { token };
}

// Resuelve el path template del spec a un path relativo usable por buildUrl:
// quita el leading slash y reemplaza {carrierId} por el id de config.
function resolvePath(pathTemplate) {
	return pathTemplate.replace(/^\//, '').replace('{carrierId}', String(config.carrierId));
}

export default function (data) {
	const headers = authHeaders(data.token);

	group('read sweep (openapi-derived GET)', function () {
		for (const ep of endpoints) {
			const url = buildUrl(resolvePath(ep.path));
			const res = http.get(url, {
				headers,
				tags: { name: ep.name }
			});
			// Read-only: no debe romper el servidor. 4xx (auth/validación) es
			// aceptable en un sweep genérico; solo fallamos ante 5xx.
			check(res, {
				'status < 500': (r) => r.status < 500
			});
		}
	});
}
