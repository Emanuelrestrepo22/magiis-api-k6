// tests/config/runtime.ts
// Fuente de verdad para env, credenciales y URL del backend Magiis.

export type AppRole = 'carrier' | 'admin' | 'driver' | 'passenger' | 'contractor' | 'web';

export type RuntimeConfig = {
	env: 'test' | 'uat' | 'prod';
	baseUrl: string;
	magiisPrefix: string;
	authApiUrl: string;
	role: AppRole;
	carrierId: number;
	driverId: number;
};

export type Credentials = {
	username: string;
	password: string;
};

function readEnv(key: string): string | undefined {
	const v = process.env[key]?.trim();
	return v ? v : undefined;
}

function parseIntEnv(key: string, fallback: number): number {
	const v = readEnv(key);
	if (!v) return fallback;
	const n = Number.parseInt(v, 10);
	if (Number.isNaN(n)) throw new Error(`Env ${key}="${v}" is not a valid integer`);
	return n;
}

export function getCurrentEnv(): 'test' | 'uat' | 'prod' {
	// Ambientes del proyecto: uat|prod (test se conserva en el tipo por compat, no se usa). Default = uat.
	const e = process.env.ENV ?? 'uat';
	if (e === 'test' || e === 'uat' || e === 'prod') return e;
	console.warn(`[runtime] ENV=${e} desconocido, usando 'uat'.`);
	return 'uat';
}

export function resolveBaseUrl(): string {
	const v = readEnv('BASE_URL');
	if (!v) throw new Error(`Missing BASE_URL in .env.${getCurrentEnv()}`);
	return v.replace(/\/+$/, '');
}

export function resolveMagiisPrefix(): string {
	// Clave ausente → default 'magiis-v0.2' (test/uat). Clave PRESENTE (incluso vacía) → respetar:
	// PROD usa base sin prefijo de versión (https://api.apps.example.com/<endpoint>), MAGIIS_API_PREFIX=.
	const raw = process.env.MAGIIS_API_PREFIX;
	if (raw === undefined) return 'magiis-v0.2';
	return raw.replace(/^\/+|\/+$/g, '');
}

export function resolveAuthApiUrl(): string {
	const v = readEnv('AUTH_API_URL');
	if (v) return v;
	// Default: base_url + prefix + auth/login
	return `${resolveBaseUrl()}/${resolveMagiisPrefix()}/auth/login`;
}

export function resolveCredentials(): Credentials {
	const username = readEnv('LOGIN_USER');
	const password = readEnv('LOGIN_PASSWORD');
	if (!username) throw new Error(`Missing LOGIN_USER in .env.${getCurrentEnv()}`);
	if (!password) throw new Error(`Missing LOGIN_PASSWORD in .env.${getCurrentEnv()}`);
	return { username, password };
}

export function resolveRole(): AppRole {
	const r = (readEnv('LOGIN_ROLE') ?? 'ROLE_CARRIER').replace(/^ROLE_/, '').toLowerCase();
	if (['carrier', 'admin', 'driver', 'passenger', 'contractor', 'web'].includes(r)) {
		return r as AppRole;
	}
	return 'carrier';
}

export function getRuntimeConfig(): RuntimeConfig {
	return {
		env: getCurrentEnv(),
		baseUrl: resolveBaseUrl(),
		magiisPrefix: resolveMagiisPrefix(),
		authApiUrl: resolveAuthApiUrl(),
		role: resolveRole(),
		carrierId: parseIntEnv('MAGIIS_TEST_CARRIER_ID', 1040),
		driverId: parseIntEnv('MAGIIS_TEST_DRIVER_ID', 1203)
	};
}
