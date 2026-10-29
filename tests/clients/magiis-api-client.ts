// tests/clients/magiis-api-client.ts
// Cliente API genérico para backend Magiis. Encapsula:
//   - Login JWT (cache en memoria)
//   - GET/POST/PUT/PATCH/DELETE con Bearer automático
//   - Construcción de URL desde {base_url}{magiis_prefix}{path}
//   - Query params, headers extras, timeouts, failOnStatusCode

import type { APIRequestContext, APIResponse } from '@playwright/test';
import { getRuntimeConfig, resolveCredentials, resolveAuthApiUrl } from '@config/runtime';
import { redactSecrets } from '@utils/redact';

export type MagiisRequestOptions = {
	params?: Record<string, string | number | boolean | string[] | number[]>;
	headers?: Record<string, string>;
	auth?: boolean;
	forceLogin?: boolean;
	timeout?: number;
	failOnStatusCode?: boolean;
};

export class MagiisApiClient {
	private cachedToken: string | null = null;
	private readonly baseUrl: string;
	private readonly magiisPrefix: string;
	private readonly authUrl: string;
	private readonly role: string;

	constructor(private readonly request: APIRequestContext) {
		const cfg = getRuntimeConfig();
		this.baseUrl = cfg.baseUrl;
		this.magiisPrefix = cfg.magiisPrefix;
		this.authUrl = resolveAuthApiUrl();
		this.role = `ROLE_${cfg.role.toUpperCase()}`;
	}

	// ─── Auth ─────────────────────────────────────────────────────────────────

	async ensureToken(forceLogin = false): Promise<string> {
		if (!forceLogin && this.cachedToken) return this.cachedToken;
		const { username, password } = resolveCredentials();
		const resp = await this.request.fetch(this.authUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				RoleToAttempt: this.role
			},
			data: { username, password },
			timeout: 30_000,
			failOnStatusCode: false
		});
		if (resp.status() !== 200) {
			const body = await resp.text();
			throw new Error(`Login failed (HTTP ${resp.status()}): ${body || '(empty body)'}`);
		}
		const parsed = (await resp.json()) as { token?: string };
		if (!parsed.token) throw new Error('Login response missing .token field');
		this.cachedToken = parsed.token;
		return this.cachedToken;
	}

	clearToken(): void {
		this.cachedToken = null;
	}

	// ─── URL building ─────────────────────────────────────────────────────────

	private buildUrl(p: string): string {
		const clean = p.replace(/^\/+/, '');
		return `${this.baseUrl}/${this.magiisPrefix}/${clean}`.replace(/([^:])\/\/+/g, '$1/');
	}

	private buildQs(params?: MagiisRequestOptions['params']): string {
		if (!params) return '';
		const parts: string[] = [];
		for (const [k, v] of Object.entries(params)) {
			if (Array.isArray(v)) {
				for (const x of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`);
			} else {
				parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
			}
		}
		return parts.length ? `?${parts.join('&')}` : '';
	}

	// ─── Request core ─────────────────────────────────────────────────────────

	private async exec(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
		path: string,
		body: unknown,
		opts: MagiisRequestOptions
	): Promise<APIResponse> {
		const useAuth = opts.auth !== false;
		const headers: Record<string, string> = {
			Accept: 'application/json',
			...(opts.headers ?? {})
		};
		if (body !== undefined && body !== null && !('Content-Type' in headers)) {
			headers['Content-Type'] = 'application/json';
		}
		if (useAuth) {
			const token = await this.ensureToken(opts.forceLogin ?? false);
			headers.Authorization = `Bearer ${token}`;
		}
		const url = this.buildUrl(path) + this.buildQs(opts.params);
		const reqOpts: Parameters<APIRequestContext['fetch']>[1] = {
			method,
			headers,
			timeout: opts.timeout ?? 30_000,
			failOnStatusCode: opts.failOnStatusCode ?? false
		};
		if (body !== undefined && body !== null) reqOpts.data = body;
		try {
			return await this.request.fetch(url, reqOpts);
		} catch (err) {
			// Playwright embebe el call log completo (headers incluidos) en el mensaje
			// de error cuando el fetch falla a nivel de red (ej. "socket hang up") --
			// redactar ACÁ, en el origen, es la primera barrera antes de que ese
			// mensaje viaje a result.error y de ahí a cualquier reporter/log.
			if (err instanceof Error) err.message = redactSecrets(err.message);
			throw err;
		}
	}

	// ─── Métodos públicos ─────────────────────────────────────────────────────

	getJson(p: string, o: MagiisRequestOptions = {}): Promise<APIResponse> {
		return this.exec('GET', p, undefined, o);
	}
	postJson(p: string, b: unknown, o: MagiisRequestOptions = {}): Promise<APIResponse> {
		return this.exec('POST', p, b, o);
	}
	putJson(p: string, b: unknown, o: MagiisRequestOptions = {}): Promise<APIResponse> {
		return this.exec('PUT', p, b, o);
	}
	patchJson(p: string, b: unknown, o: MagiisRequestOptions = {}): Promise<APIResponse> {
		return this.exec('PATCH', p, b, o);
	}
	deleteJson(p: string, o: MagiisRequestOptions = {}): Promise<APIResponse> {
		return this.exec('DELETE', p, undefined, o);
	}
}
