// scripts/verify-prod-bugs.ts
// Verificación READ-ONLY de los 2 bugs candidatos contra el ambiente de .env.prod.
// Solo hace login + 2 GET. NO muta nada. NO imprime credenciales ni datos (solo status + causa).
//
// Uso: npx tsx scripts/verify-prod-bugs.ts   (lee .env.prod)

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const BASE = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const PREFIX = (process.env.MAGIIS_API_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
const AUTH = process.env.AUTH_API_URL ?? `${BASE}/${PREFIX}/auth/login`;
const USER = process.env.LOGIN_USER ?? '';
const PASS = process.env.LOGIN_PASSWORD ?? '';
const ROLE = process.env.LOGIN_ROLE ?? 'ROLE_CARRIER';
const CARRIER = process.env.MAGIIS_TEST_CARRIER_ID ?? '';

const url = (p: string) => `${BASE}/${PREFIX}/${p}`.replace(/([^:])\/{2,}/g, '$1/');

function snippet(text: string): string {
	// Reporta solo la señal de error (clase/mensaje), truncada; evita volcar datos.
	const t = text.replace(/\s+/g, ' ').trim();
	const m = t.match(/(SQLGrammarException|GrammarException|[A-Za-z]+Exception|"message"\s*:\s*"[^"]{0,120}")/);
	return (m ? m[0] : t.slice(0, 120)).slice(0, 160);
}

async function main(): Promise<void> {
	if (!BASE || !USER || !PASS) throw new Error('Faltan BASE_URL / LOGIN_USER / LOGIN_PASSWORD en .env.prod');
	console.log(`Ambiente: ${BASE}/${PREFIX} · role ${ROLE} · carrier ${CARRIER || '(sin id)'}`);

	// login
	const loginRes = await fetch(AUTH, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', RoleToAttempt: ROLE },
		body: JSON.stringify({ username: USER, password: PASS })
	});
	if (loginRes.status !== 200) {
		console.log(`❌ login → HTTP ${loginRes.status}. Abortando (revisá credenciales de .env.prod).`);
		process.exitCode = 1;
		return;
	}
	const token = ((await loginRes.json()) as { token?: string }).token;
	if (!token) throw new Error('login OK pero sin token');
	console.log('✔ login OK\n');
	const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

	// Bug 1 — travels/paginated (esperado bug: 500 SQLGrammarException)
	if (CARRIER) {
		const r = await fetch(url(`carriers/${CARRIER}/travels/paginated?page=1&size=10&column=id&sort=DESC`), {
			headers: auth
		});
		const body = await r.text();
		const verdict =
			r.status === 500 ? 'REPRODUCE (500)' : r.status === 200 ? 'NO reproduce (200 OK)' : `otro (${r.status})`;
		console.log(`Bug 1 · GET carriers/${CARRIER}/travels/paginated?column=id → HTTP ${r.status} → ${verdict}`);
		if (r.status >= 400) console.log(`         causa: ${snippet(body)}`);
	} else {
		console.log('Bug 1 · omitido (falta MAGIIS_TEST_CARRIER_ID)');
	}

	// Bug 2 — admins/paginated con ROLE_CARRIER (esperado bug: 500 en vez de 403)
	const r2 = await fetch(url('admins/paginated?page=1&size=10&column=id&sort=ASC'), { headers: auth });
	const body2 = await r2.text();
	const verdict2 =
		r2.status === 500
			? 'REPRODUCE (500 en vez de 403)'
			: r2.status === 403
				? 'FIX correcto (403)'
				: `otro (${r2.status})`;
	console.log(`Bug 2 · GET admins/paginated [ROLE_CARRIER] → HTTP ${r2.status} → ${verdict2}`);
	if (r2.status >= 400) console.log(`         causa: ${snippet(body2)}`);
}

await main();
