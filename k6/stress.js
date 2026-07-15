// k6/stress.js
// Stress test: rampa agresiva hasta 50 VUs para encontrar el punto de quiebre
// del backend (donde la latencia se dispara o empiezan los errores). Reusa los
// mismos GET read-only. Login una sola vez en setup() y token compartido.
//
// Los thresholds acá funcionan como criterio de FALLO controlado: si p(95) > 800ms
// o la tasa de error supera 1%, k6 marca el run como fallido — eso es esperado y
// justamente lo que buscamos identificar bajo estrés.
//
// Ejecución (OPT-IN, solo con luz verde del QA Lead — ver README.md):
//   k6 run k6/stress.js
//
// Env vars: ver k6/lib/config.js.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { config, buildUrl } from './lib/config.js';
import { login, authHeaders } from './lib/auth.js';

export const options = {
	stages: [
		{ duration: '1m', target: 20 }, // rampa 0 -> 20 VUs
		{ duration: '2m', target: 50 }, // rampa 20 -> 50 VUs (presión creciente)
		{ duration: '2m', target: 50 }, // sostener 50 VUs (buscar quiebre)
		{ duration: '1m', target: 0 } // recuperación 50 -> 0 VUs
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

	sleep(1);
}
