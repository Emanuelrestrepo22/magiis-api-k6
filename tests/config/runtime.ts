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
	/** Perfil de credenciales activo (`null` = credenciales base). Se expone para que la evidencia
	 *  declare CON QUÉ carrier corrió: en UAT conviven mercados con catálogos distintos. */
	loginProfile: string | null;
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

/**
 * Perfil de credenciales activo. Un mismo ambiente puede tener carriers de mercados distintos
 * (p. ej. UAT tiene uno argentino y uno de EE.UU.) y el catálogo de direcciones difiere entre
 * ellos, así que el perfil cambia QUÉ datos ve la suite, no solo con qué usuario entra.
 *
 * Sin `LOGIN_PROFILE` → claves base (`LOGIN_USER`). Con `LOGIN_PROFILE=usa` → claves sufijadas
 * (`LOGIN_USER_USA`). El sufijo se normaliza a MAYÚSCULAS.
 */
export function resolveLoginProfile(): string | null {
	const raw = process.env.LOGIN_PROFILE?.trim();
	return raw ? raw.toUpperCase() : null;
}

export function resolveCredentials(): Credentials {
	const profile = resolveLoginProfile();
	const suffix = profile ? `_${profile}` : '';
	const userKey = `LOGIN_USER${suffix}`;
	const passKey = `LOGIN_PASSWORD${suffix}`;

	const username = readEnv(userKey);
	const password = readEnv(passKey);

	// Un perfil pedido y ausente FALLA. Caer a las credenciales base dejaría la suite corriendo
	// contra otro carrier —otro mercado, otro catálogo de direcciones— mientras el reporte diría
	// que corrió con el perfil pedido: evidencia real atribuida al actor equivocado.
	if (!username || !password) {
		const missing = [!username ? userKey : null, !password ? passKey : null].filter(Boolean).join(' y ');
		const hint = profile
			? `Perfil LOGIN_PROFILE=${profile.toLowerCase()}: falta ${missing} en .env.${getCurrentEnv()}. ` +
				`Definilas o quitá LOGIN_PROFILE para usar las credenciales base.`
			: `Falta ${missing} en .env.${getCurrentEnv()}.`;
		throw new Error(hint);
	}
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
		driverId: parseIntEnv('MAGIIS_TEST_DRIVER_ID', 1203),
		loginProfile: resolveLoginProfile()
	};
}
