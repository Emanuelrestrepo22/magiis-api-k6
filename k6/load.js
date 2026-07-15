// k6/load.js
// Carga sostenida: rampa suave hasta 10 VUs, mantiene 1 min y baja a 0.
// Reusa los mismos GET read-only del smoke. El login se hace UNA vez en
// setup() y el token se comparte a todos los VUs (no re-loguear por iteración,
// para no medir el login como parte de la carga de lectura).
//
// Ejecución (OPT-IN, solo con luz verde del QA Lead — ver README.md):
//   k6 run k6/load.js
//
// Env vars: ver k6/lib/config.js.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { config, buildUrl } from './lib/config.js';
import { login, authHeaders } from './lib/auth.js';

export const options = {
	stages: [
		{ duration: '30s', target: 10 }, // rampa 0 -> 10 VUs
		{ duration: '1m', target: 10 }, // sostener 10 VUs
		{ duration: '30s', target: 0 } // rampa 10 -> 0 VUs
	],
	thresholds: {
		http_req_duration: ['p(95)<800'],
		http_req_failed: ['rate<0.01']
	}
};

// setup() corre una sola vez antes de la carga; su retorno se pasa a cada VU.
export function setup() {
	const token = login();
	return { token };
}

export default function (data) {
	const headers = authHeaders(data.token);

	group('carrier detail', function () {
		const res = http.get(buildUrl(`carriers/${config.carrierId}`), {
			headers,
			tags: { name: 'carriers/{id}' }
		});
		check(res, { 'carrier detail 200': (r) => r.status === 200 });
	});

	group('carrier travels paginated', function () {
		const path = `carriers/${config.carrierId}/travels/paginated?page=1&size=10&column=id&sort=DESC`;
		const res = http.get(buildUrl(path), {
			headers,
			tags: { name: 'carriers/{id}/travels/paginated' }
		});
		check(res, { 'travels paginated 200': (r) => r.status === 200 });
	});

	group('server info (public)', function () {
		const res = http.get(buildUrl('config/serverInfo'), {
			headers: { Accept: 'application/json' },
			tags: { name: 'config/serverInfo' }
		});
		check(res, { 'serverInfo 200': (r) => r.status === 200 });
	});

	// Think time entre iteraciones para simular usuario real.
	sleep(1);
}
