// scripts/probe-prod-failures.ts — READ-ONLY. Login único + GETs de bajo volumen contra .env.prod.
// Objetivo: capturar status + snippet de error de cada endpoint que falló en la suite,
// con los params EXACTOS de los tests + variantes, para clasificar bug real vs param vs data/externo.
// NO muta. NO imprime credenciales.
//
// Uso: npx tsx scripts/probe-prod-failures.ts   (lee .env.prod)

import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const BASE = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const PREFIX = (process.env.MAGIIS_API_PREFIX ?? '').replace(/^\/+|\/+$/g, '');
const AUTH = process.env.AUTH_API_URL ?? `${BASE}/${PREFIX}/auth/login`;
const USER = process.env.LOGIN_USER ?? '';
const PASS = process.env.LOGIN_PASSWORD ?? '';
const ROLE = process.env.LOGIN_ROLE ?? 'ROLE_CARRIER';
const CARRIER = Number(process.env.MAGIIS_TEST_CARRIER_ID ?? '1040');
const DRIVER = Number(process.env.MAGIIS_TEST_DRIVER_ID ?? '1203');

const url = (p: string) => `${BASE}/${PREFIX}/${p}`.replace(/([^:])\/{2,}/g, '$1/');

let AUTHH: Record<string, string> = {};

function qs(params?: Record<string, string | number | boolean>): string {
	if (!params) return '';
	const u = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) u.set(k, String(v));
	const s = u.toString();
	return s ? `?${s}` : '';
}

function snippet(text: string, status: number): string {
	const t = text.replace(/\s+/g, ' ').trim();
	if (t === '') return `<empty body> (len=0, status ${status})`;
	const cls = t.match(
		/(SQLGrammarException|DataIntegrity\w*|NullPointerException|NoSuchElementException|IllegalArgument\w*|MethodArgumentTypeMismatch\w*|HttpMessageNotReadable\w*|Optional\.\w+|No value present|[A-Za-z]+Exception)/
	);
	const msg = t.match(/"message"\s*:\s*"([^"]{0,160})"/);
	const parts: string[] = [];
	if (cls) parts.push(cls[0]);
	if (msg) parts.push(`msg="${msg[1]}"`);
	if (parts.length === 0) parts.push(t.slice(0, 140));
	return parts.join(' · ').slice(0, 220);
}

async function probe(
	label: string,
	p: string,
	params?: Record<string, string | number | boolean>
): Promise<{ status: number; body: string; empty: boolean }> {
	const full = url(p) + qs(params);
	const r = await fetch(full, { headers: AUTHH });
	const body = await r.text();
	const empty = body.trim() === '';
	const tag = r.status >= 500 ? '[500]' : r.status === 200 ? (empty ? '[200-empty]' : '[200-ok]') : `[${r.status}]`;
	console.log(`${tag}  ${label}`);
	if (r.status >= 400 || empty) console.log(`        -> ${snippet(body, r.status)}`);
	return { status: r.status, body, empty };
}

async function firstFromPage(
	p: string,
	params: Record<string, string | number>,
	field: string
): Promise<number | undefined> {
	const r = await fetch(url(p) + qs(params), { headers: AUTHH });
	if (r.status !== 200) return undefined;
	try {
		const j = (await r.json()) as {
			content?: Array<Record<string, number>>;
			page?: { content?: Array<Record<string, number>> };
		};
		const arr = j.content ?? j.page?.content ?? [];
		return arr[0]?.[field];
	} catch {
		return undefined;
	}
}

async function firstFromArray(p: string, field: string): Promise<number | undefined> {
	const r = await fetch(url(p), { headers: AUTHH });
	if (r.status !== 200) return undefined;
	try {
		const j = (await r.json()) as Array<Record<string, number>>;
		return Array.isArray(j) ? j[0]?.[field] : undefined;
	} catch {
		return undefined;
	}
}

const P1 = { page: 1, size: 10, column: 'id', sort: 'ASC' };
const P0 = { page: 0, size: 10, column: 'id', sort: 'ASC' };

async function main(): Promise<void> {
	if (!BASE || !USER || !PASS) throw new Error('Faltan credenciales en .env.prod');
	console.log(`Ambiente: ${BASE}/${PREFIX || '(sin prefijo)'} - role ${ROLE} - carrier ${CARRIER}\n`);

	const loginRes = await fetch(AUTH, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', RoleToAttempt: ROLE },
		body: JSON.stringify({ username: USER, password: PASS })
	});
	if (loginRes.status !== 200) {
		console.log(`login FALLO -> HTTP ${loginRes.status}`);
		process.exitCode = 1;
		return;
	}
	const token = ((await loginRes.json()) as { token?: string }).token;
	if (!token) throw new Error('login sin token');
	AUTHH = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
	console.log('login OK\n');

	console.log('=== A) PAGINADOS que fallaron 500 - params exactos del test + variantes ===');
	console.log('    (control: clients/paginated PASO 200; contraste con owners/paginated)\n');
	await probe(
		'[CONTROL] checking-accounts/carrier/C/clients/paginated (test:P1)',
		`checking-accounts/carrier/${CARRIER}/clients/paginated`,
		P1
	);
	await probe(
		'checking-accounts/carrier/C/owners/paginated (test:P1)',
		`checking-accounts/carrier/${CARRIER}/owners/paginated`,
		P1
	);
	await probe(
		'checking-accounts/carrier/C/owners/paginated (page0)',
		`checking-accounts/carrier/${CARRIER}/owners/paginated`,
		P0
	);
	await probe(
		'checking-accounts/carrier/C/owners/paginated (P1+find+movementFilter)',
		`checking-accounts/carrier/${CARRIER}/owners/paginated`,
		{ ...P1, find: '', movementFilter: '' }
	);
	console.log('');
	await probe('carrier/C/contractors/paginated (test:P1)', `carrier/${CARRIER}/contractors/paginated`, P1);
	await probe('carrier/C/contractors/paginated (page0)', `carrier/${CARRIER}/contractors/paginated`, P0);
	await probe('carrier/C/contractors/paginated (P1+find+status)', `carrier/${CARRIER}/contractors/paginated`, {
		...P1,
		find: '',
		status: ''
	});
	console.log('');
	await probe('carriers/C/clients/paginated (test:P1)', `carriers/${CARRIER}/clients/paginated`, P1);
	await probe('carriers/C/clients/paginated (page0)', `carriers/${CARRIER}/clients/paginated`, P0);
	await probe('carriers/C/clients/paginated (P1+find+type)', `carriers/${CARRIER}/clients/paginated`, {
		...P1,
		find: '',
		type: ''
	});
	console.log('');
	await probe('api/applications/paginated (test:P1)', 'api/applications/paginated', P1);
	await probe('api/applications/paginated (page0)', 'api/applications/paginated', P0);
	console.log('');
	const to = '2026-07-14';
	await probe(
		'billing/admin/withoutLiquidations/C/{to}/paginated (test:P1)',
		`billing/admin/withoutLiquidations/${CARRIER}/${to}/paginated`,
		P1
	);
	await probe('affiliateAgreement/paginated (test:P1)', 'affiliateAgreement/paginated', P1);
	await probe('affiliateAgreement/paginated (page0)', 'affiliateAgreement/paginated', P0);

	console.log('\n=== B) SHAPE - billing/admin/liquidations/paginated (200 con page.content anidado) ===\n');
	await probe('billing/admin/liquidations/paginated (P1+find)', 'billing/admin/liquidations/paginated', {
		...P1,
		find: ''
	});

	console.log('\n=== C) DATA-DEPENDENT / EXTERNOS que dieron 500 (capturar causa) ===\n');
	await probe('billing/carriers/C/travels', `billing/carriers/${CARRIER}/travels`);
	await probe('drivers/reportDriverLocationTable/{driverId}', `drivers/reportDriverLocationTable/${DRIVER}`);
	await probe(
		'magiisaccess/securityrolemagiisaccess/ROLE_CARRIER',
		`magiisaccess/securityrolemagiisaccess/${encodeURIComponent(ROLE)}`
	);
	await probe('magiisServicesCost/search (sin body)', 'magiisServicesCost/search');
	await probe('odn/C/providers/GNET', `odn/${CARRIER}/providers/GNET`);
	await probe('odn/C/GNET/driversLocations', `odn/${CARRIER}/GNET/driversLocations`);
	await probe(
		'odn/C/providers/GNET/placeholder-provider/vehiclesTypes (dio 409)',
		`odn/${CARRIER}/providers/GNET/placeholder-provider/vehiclesTypes`
	);
	await probe('vendor/mailchimp/C/lists', `vendor/mailchimp/${CARRIER}/lists`);
	await probe('places/checkPlace/{placeholder}', 'places/checkPlace/ChIJ0000000000000000000000');

	console.log('\n=== D) 404 / 401 - derivar id real y probar ===\n');
	const carrierUserId = await firstFromPage(`carriers/carrierUser/${CARRIER}/paginated`, P1, 'id');
	console.log(`    (carrierUserId derivado = ${carrierUserId ?? 'undefined'})`);
	if (carrierUserId) await probe('carriers/carrierUser/{id} (derivado)', `carriers/carrierUser/${carrierUserId}`);
	await probe('carriers/C/travels/722494 (dio 401)', `carriers/${CARRIER}/travels/722494`);

	console.log('\n=== E) EMPTY-BODY (200 con cuerpo vacio -> .json() rompe) ===\n');
	await probe('carriers/C/clients (list)', `carriers/${CARRIER}/clients`);
	await probe('api/user/validate/qa-e2e-nonexistent', 'api/user/validate/qa-e2e-nonexistent');
	const passengerId = await firstFromArray(`carriers/${CARRIER}/clients`, 'passengerUserId');
	console.log(`    (passengerUserId derivado = ${passengerId ?? 'undefined'})`);
	if (passengerId) {
		await probe('passengers/{id}/allCards', `passengers/${passengerId}/allCards`);
		await probe(
			'contractorEmployees/byPassenger/{id}/paginated',
			`contractorEmployees/byPassenger/${passengerId}/paginated`,
			P1
		);
	}
}

await main();
