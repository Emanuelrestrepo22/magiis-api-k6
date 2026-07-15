// k6/latency.js
// Validación de LATENCIA con concurrencia (VUs) sobre endpoints READ-ONLY seguros y de bajo costo.
// Login una vez en setup(); cada VU itera un set fijo de GET rápidos. Mide p95/p99 por endpoint (tags).
//
// Uso (env vars vía -e o entorno; ver k6/lib/config.js):
//   k6 run -e VUS=5 -e DURATION=20s k6/latency.js
// OPT-IN. Contra PROD: solo concurrencia BAJA y read-only (no cargar producción). NUNCA stress aquí.

import http from 'k6/http';
import { check } from 'k6';
import { config, buildUrl } from './lib/config.js';
import { login, authHeaders } from './lib/auth.js';

const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '20s';

export const options = {
	scenarios: {
		latency: { executor: 'constant-vus', vus: VUS, duration: DURATION }
	},
	thresholds: {
		http_req_duration: ['p(95)<800', 'p(99)<1500'],
		http_req_failed: ['rate<0.05']
	}
};

// Endpoints read-only rápidos (evita listados pesados y el bug travels/paginated).
const ENDPOINTS = [
	{ name: 'config/serverInfo', path: 'config/serverInfo', auth: false },
	{ name: 'carriers/{id}', path: `carriers/${config.carrierId}`, auth: true },
	{ name: 'multiregion/countries', path: 'multiregion/countries', auth: true },
	{ name: 'multiregion/timezones', path: 'multiregion/timezones', auth: true }
];

export function setup() {
	return { token: login() };
}

export default function (data) {
	const headers = authHeaders(data.token);
	for (const e of ENDPOINTS) {
		const res = http.get(buildUrl(e.path), {
			headers: e.auth ? headers : { Accept: 'application/json' },
			tags: { name: e.name }
		});
		check(res, { [`${e.name} status<500`]: (r) => r.status < 500 });
	}
}
