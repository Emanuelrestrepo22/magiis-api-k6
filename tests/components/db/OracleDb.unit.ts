// tests/components/db/OracleDb.unit.ts
// Unit test de `oracleConfigFromEnv` / `currentDbEnv` (node:test — sin runner de Playwright).
// Sufijo .unit.ts para que Playwright (testMatch **/*.api.test.ts) NO lo recoja.
// Run: npx tsx --test tests/components/db/OracleDb.unit.ts
//
// Prueba negativa del fix de TM-934 (falso verde por credenciales Oracle ausentes): `prod` NUNCA
// debe resolver las credenciales sin sufijo de `uat`, y sin credenciales declaradas para el entorno
// activo, `oracleConfigFromEnv()` debe devolver `null` de forma explícita (nunca un config
// "prestado" de otro ambiente).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const ORACLE_VARS = [
	'ORACLE_USER',
	'ORACLE_PASSWORD',
	'ORACLE_HOST',
	'ORACLE_PORT',
	'ORACLE_SERVICE',
	'ORACLE_CONNECT_STRING',
	'ORACLE_USER_TEST',
	'ORACLE_PASSWORD_TEST',
	'ORACLE_HOST_TEST',
	'ORACLE_PORT_TEST',
	'ORACLE_SERVICE_TEST',
	'ORACLE_CONNECT_STRING_TEST',
	'ORACLE_USER_PROD',
	'ORACLE_PASSWORD_PROD',
	'ORACLE_HOST_PROD',
	'ORACLE_PORT_PROD',
	'ORACLE_SERVICE_PROD',
	'ORACLE_CONNECT_STRING_PROD'
] as const;

/** Limpia todas las variables ORACLE_* + ENV/TEST_ENV antes de cada caso (aislamiento entre tests). */
function resetEnv(): void {
	for (const key of ORACLE_VARS) delete process.env[key];
	delete process.env.ENV;
	delete process.env.TEST_ENV;
}

/** Reimporta el módulo con cache-busting: `oracleConfigFromEnv` lee `process.env` en cada llamada, no hace falta re-importar, pero se mantiene explícito por si cambia la implementación. */
async function loadModule() {
	return import('./OracleDb');
}

test('ENV=uat sin ORACLE_* -> null explícito (nunca hereda credenciales de otro ambiente)', async () => {
	resetEnv();
	process.env.ENV = 'uat';
	const { oracleConfigFromEnv } = await loadModule();
	assert.equal(oracleConfigFromEnv(), null);
});

test('ENV=test sin ORACLE_USER_TEST/ORACLE_PASSWORD_TEST -> null explícito, aunque existan las variables sin sufijo de uat', async () => {
	resetEnv();
	process.env.ENV = 'test';
	process.env.ORACLE_USER = 'uat-user';
	process.env.ORACLE_PASSWORD = 'uat-pass';
	process.env.ORACLE_CONNECT_STRING = 'uat-host:1521/uat-service';
	const { oracleConfigFromEnv } = await loadModule();
	assert.equal(
		oracleConfigFromEnv(),
		null,
		'ENV=test nunca debe resolver las credenciales sin sufijo de uat como fallback'
	);
});

test('ENV=prod sin ORACLE_*_PROD -> null explícito, aunque existan las variables sin sufijo de uat (regresión TM-934: antes, prod caía en uat)', async () => {
	resetEnv();
	process.env.ENV = 'prod';
	process.env.ORACLE_USER = 'uat-user';
	process.env.ORACLE_PASSWORD = 'uat-pass';
	process.env.ORACLE_CONNECT_STRING = 'uat-host:1521/uat-service';
	const { oracleConfigFromEnv } = await loadModule();
	assert.equal(
		oracleConfigFromEnv(),
		null,
		'ENV=prod NUNCA debe resolver ni consultar la base de UAT — antes de este fix, prod caía en la rama uat por default'
	);
});

test('ENV=prod con ORACLE_*_PROD declaradas -> config propia de prod, no la de uat', async () => {
	resetEnv();
	process.env.ENV = 'prod';
	process.env.ORACLE_USER = 'uat-user';
	process.env.ORACLE_PASSWORD = 'uat-pass';
	process.env.ORACLE_CONNECT_STRING = 'uat-host:1521/uat-service';
	process.env.ORACLE_USER_PROD = 'prod-user';
	process.env.ORACLE_PASSWORD_PROD = 'prod-pass';
	process.env.ORACLE_CONNECT_STRING_PROD = 'prod-host:1521/prod-service';
	const { oracleConfigFromEnv } = await loadModule();
	assert.deepEqual(oracleConfigFromEnv(), {
		user: 'prod-user',
		password: 'prod-pass',
		connectString: 'prod-host:1521/prod-service'
	});
});

test('ENV=test con ORACLE_*_TEST completas -> config de test (partes sueltas host+port+service)', async () => {
	resetEnv();
	process.env.ENV = 'test';
	process.env.ORACLE_USER_TEST = 'test-user';
	process.env.ORACLE_PASSWORD_TEST = 'test-pass';
	process.env.ORACLE_HOST_TEST = 'test-host';
	process.env.ORACLE_PORT_TEST = '1521';
	process.env.ORACLE_SERVICE_TEST = 'test-service';
	const { oracleConfigFromEnv } = await loadModule();
	assert.deepEqual(oracleConfigFromEnv(), {
		user: 'test-user',
		password: 'test-pass',
		connectString: 'test-host:1521/test-service'
	});
});

test('ENV con valor no reconocido (ej. "staging") -> degrada a uat pero emite console.warn (no falla en silencio)', async () => {
	resetEnv();
	process.env.ENV = 'staging';
	const { oracleConfigFromEnv } = await loadModule();
	const originalWarn = console.warn;
	const warnings: unknown[][] = [];
	console.warn = (...args: unknown[]) => {
		warnings.push(args);
	};
	try {
		oracleConfigFromEnv();
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(warnings.length, 1, 'debe emitir exactamente un console.warn');
	assert.match(String(warnings[0][0]), /ENV\/TEST_ENV="staging" no reconocido/);
});

test('ENV sin setear (undefined) -> uat por default, SIN console.warn (no es un error de configuración)', async () => {
	resetEnv();
	const { oracleConfigFromEnv } = await loadModule();
	const originalWarn = console.warn;
	const warnings: unknown[][] = [];
	console.warn = (...args: unknown[]) => {
		warnings.push(args);
	};
	try {
		oracleConfigFromEnv();
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(warnings.length, 0, 'ENV no seteado es el caso normal -- no debe advertir');
});

resetEnv();
