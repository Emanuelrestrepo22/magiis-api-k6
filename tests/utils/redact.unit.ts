// tests/utils/redact.unit.ts
// Unit test del helper de redacción de secretos (node:test -- sin runner de Playwright).
// Sufijo .unit.ts para que Playwright (testMatch **/*.api.test.ts) NO lo recoja.
// Run: npx tsx --test tests/utils/redact.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from './redact';

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.FAKE_SIGNATURE_NOT_A_REAL_TOKEN_XXXXXXXXXXXXXXXXXXXXXXXX';

test('redacta Authorization: Bearer <token> en un call log de Playwright', () => {
	const raw =
		'apiRequestContext.fetch: socket hang up\nCall log:\n  - → POST https://api.magiis.com/x\n' +
		`  - authorization: Bearer ${FAKE_TOKEN}\n  - content-type: application/json`;
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes(FAKE_TOKEN), 'el token no debe aparecer en el resultado');
	assert.match(cleaned, /authorization: \[REDACTED\]/i);
	assert.match(cleaned, /content-type: application\/json/); // preserva el resto del volcado
});

test('redacta Authorization en headers serializados como JSON', () => {
	const raw = JSON.stringify({ headers: { Authorization: `Bearer ${FAKE_TOKEN}`, Accept: 'application/json' } });
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes(FAKE_TOKEN));
	assert.match(cleaned, /"Authorization":"\[REDACTED\]"/i);
	assert.match(cleaned, /"Accept":"application\/json"/);
});

test('es case-insensitive en el nombre del header', () => {
	const cleaned = redactSecrets(`AUTHORIZATION: Bearer ${FAKE_TOKEN}`);
	assert.ok(!cleaned.includes(FAKE_TOKEN));
});

test('redacta Cookie y Set-Cookie', () => {
	const cleaned = redactSecrets(`Cookie: session=${FAKE_TOKEN}\nSet-Cookie: session=${FAKE_TOKEN}; HttpOnly`);
	assert.ok(!cleaned.includes(FAKE_TOKEN));
});

test('no toca texto sin headers sensibles', () => {
	const raw = 'expect(received).toBe(expected)\n\nExpected: 200\nReceived: 500';
	assert.equal(redactSecrets(raw), raw);
});

test('maneja string vacío sin lanzar', () => {
	assert.equal(redactSecrets(''), '');
});

test('set-cookie con multiples cookies unidas por coma: ninguna queda visible', () => {
	const cleaned = redactSecrets('set-cookie: sid=SECRET1, sid2=SECRET2');
	assert.ok(!cleaned.includes('SECRET1'));
	assert.ok(!cleaned.includes('SECRET2'));
	assert.equal(cleaned, 'set-cookie: [REDACTED]');
});

test('Set-Cookie real con Expires (contiene coma en el propio valor): se redacta completo', () => {
	const raw = 'Set-Cookie: sid=TOK; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/';
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes('TOK'));
	assert.ok(!cleaned.includes('09 Jun 2027'));
	assert.equal(cleaned, 'Set-Cookie: [REDACTED]');
});

test('no redacta "authorization" cuando aparece como prosa a mitad de oracion (no es un header)', () => {
	const raw = 'Error: insufficient authorization: user lacks role admin';
	assert.equal(redactSecrets(raw), raw);
});

test('call log multilinea real de Playwright: redacta solo la linea del header sensible', () => {
	const raw =
		'apiRequestContext.fetch: socket hang up\nCall log:\n  - → POST https://api.magiis.com/x\n' +
		'  - authorization: Bearer FAKE_TOKEN_XXXX\n  - content-type: application/json';
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes('FAKE_TOKEN_XXXX'));
	assert.match(cleaned, / {2}- authorization: \[REDACTED\]/);
	assert.match(cleaned, / {2}- content-type: application\/json/);
	assert.match(cleaned, /→ POST https:\/\/api\.magiis\.com\/x/);
});

test('JSON de una linea: redacta Authorization y preserva el resto de las claves', () => {
	const raw = '{"Authorization":"Bearer FAKE_TOKEN_XXXX","other":"keep-this"}';
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes('FAKE_TOKEN_XXXX'));
	assert.equal(cleaned, '{"Authorization":"[REDACTED]","other":"keep-this"}');
});

test('redacta la clave JSON "token" en un body de respuesta y preserva el resto', () => {
	const raw = '{"token":"eyJhbGciOiJIUzI1NiJ9.FAKE.SIG","user":"pepe"}';
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes('eyJhbGciOiJIUzI1NiJ9.FAKE.SIG'));
	assert.equal(cleaned, '{"token":"[REDACTED]","user":"pepe"}');
});

test('redacta access_token y refresh_token, preserva expires_in', () => {
	const raw = '{"access_token":"FAKE1","refresh_token":"FAKE2","expires_in":3600}';
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes('FAKE1'));
	assert.ok(!cleaned.includes('FAKE2'));
	assert.equal(cleaned, '{"access_token":"[REDACTED]","refresh_token":"[REDACTED]","expires_in":3600}');
});

test('no redacta "token" en prosa en inglés (no es una clave estructurada)', () => {
	const raw = 'expected token to be truthy';
	assert.equal(redactSecrets(raw), raw);
});

test('no redacta "token" en prosa en español (mensaje real de assert de estos repos)', () => {
	const raw = 'el token de la ruta no se resolvió contra PARAMETERS';
	assert.equal(redactSecrets(raw), raw);
});

test('redacta password en formato query-string (campo=valor), preserva el resto', () => {
	const raw = 'password=FAKE_PW&user=pepe';
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes('FAKE_PW'));
	assert.equal(cleaned, 'password=[REDACTED]&user=pepe');
});

test('body de login anidado: redacta token dentro de "data", preserva estructura y "pepe"', () => {
	const raw = '{"data":{"token":"FAKE","profile":{"name":"pepe"}}}';
	const cleaned = redactSecrets(raw);
	assert.ok(!cleaned.includes('"token":"FAKE"'));
	assert.equal(cleaned, '{"data":{"token":"[REDACTED]","profile":{"name":"pepe"}}}');
});
