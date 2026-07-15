// k6/lib/auth.js
// Login JWT contra el backend Magiis para los scripts de performance (k6).
// Mismo contrato que el suite Playwright:
//   POST {BASE_URL}/{PREFIX}/auth/login
//   headers: Content-Type: application/json, RoleToAttempt: {LOGIN_ROLE}
//   body:    { username, password }
//   respuesta 200: { token }
// Luego se usa Authorization: Bearer {token} en los requests autenticados.

import http from 'k6/http';
import { check, fail } from 'k6';
import { config, buildUrl } from './config.js';

// Hace el POST de login y devuelve el token JWT.
// Si faltan credenciales o el login no responde 200 con token, aborta la
// iteración con `fail()` (no tiene sentido seguir sin token).
export function login() {
	if (!config.loginUser || !config.loginPassword) {
		fail('Faltan credenciales: setear LOGIN_USER y LOGIN_PASSWORD en el entorno');
	}

	const url = buildUrl('auth/login');
	const payload = JSON.stringify({
		username: config.loginUser,
		password: config.loginPassword
	});
	const params = {
		headers: {
			'Content-Type': 'application/json',
			RoleToAttempt: config.loginRole
		},
		tags: { name: 'auth/login' }
	};

	const res = http.post(url, payload, params);

	const ok = check(res, {
		'login status 200': (r) => r.status === 200,
		'login devuelve token': (r) => {
			try {
				return typeof r.json('token') === 'string' && r.json('token').length > 0;
			} catch (_e) {
				return false;
			}
		}
	});

	if (!ok) {
		fail(`Login falló (HTTP ${res.status}): ${res.body || '(body vacío)'}`);
	}

	return res.json('token');
}

// Devuelve los headers de un request autenticado con Bearer token.
export function authHeaders(token) {
	return {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	};
}
