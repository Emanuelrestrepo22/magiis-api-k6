// k6/smoke.js
// Smoke de performance: 1 VU, 1 iteración. Valida que los flujos críticos
// read-only del backend Magiis respondan 2xx. NO genera carga — es un chequeo
// de humo para confirmar que endpoints + auth están sanos antes de correr load.
//
// Ejecución (OPT-IN, solo con luz verde del QA Lead — ver README.md):
//   k6 run k6/smoke.js
//
// Env vars: ver k6/lib/config.js (BASE_URL, MAGIIS_API_PREFIX, LOGIN_*, MAGIIS_TEST_*).

import http from 'k6/http';
import { check, group } from 'k6';
import { config, buildUrl } from './lib/config.js';
import { login, authHeaders } from './lib/auth.js';

export const options = {
	vus: 1,
	iterations: 1,
	thresholds: {
		http_req_duration: ['p(95)<800'],
		http_req_failed: ['rate<0.01']
	}
};

export default function () {
	// 1) Login — obtiene el token JWT (ya valida status 200 + token con check()).
	const token = login();
	const headers = authHeaders(token);

	// 2) GET carrier por id.
	group('carrier detail', function () {
		const res = http.get(buildUrl(`carriers/${config.carrierId}`), {
			headers,
			tags: { name: 'carriers/{id}' }
		});
		check(res, { 'carrier detail 200': (r) => r.status === 200 });
	});

	// 3) GET travels paginados del carrier.
	group('carrier travels paginated', function () {
		const path = `carriers/${config.carrierId}/travels/paginated?page=1&size=10&column=id&sort=DESC`;
		const res = http.get(buildUrl(path), {
			headers,
			tags: { name: 'carriers/{id}/travels/paginated' }
		});
		check(res, { 'travels paginated 200': (r) => r.status === 200 });
	});

	// 4) GET serverInfo — endpoint público (sin token).
	group('server info (public)', function () {
		const res = http.get(buildUrl('config/serverInfo'), {
			headers: { Accept: 'application/json' },
			tags: { name: 'config/serverInfo' }
		});
		check(res, { 'serverInfo 200': (r) => r.status === 200 });
	});
}
