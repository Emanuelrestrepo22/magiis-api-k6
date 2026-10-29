// tests/components/TestContext.ts
// KATA Architecture — Layer 1: Test Context (API-only pilot).
//
// Fundamento de la jerarquía KATA en esta suite. Centraliza el transporte HTTP
// (MagiisApiClient) y la config de runtime para todos los componentes de dominio.
//
// Adaptación al runtime del repo: esta suite es API-only (sin browser). Por eso el
// TestContext NO inyecta `page`/`request` de Playwright directamente — envuelve el
// MagiisApiClient existente (que ya resuelve login JWT, prefijo Magiis y baseURL vía
// tests/config/runtime). ApiBase (L2) extiende esta clase; los componentes (L3) la
// heredan y consumen `this.api` (transporte) + `this.cfg` (runtime).

import type { MagiisApiClient } from '@clients/magiis-api-client';
import { getRuntimeConfig, type RuntimeConfig } from '@config/runtime';

export interface TestContextOptions {
	/** Transporte HTTP compartido (login JWT + URL building). Inyectado por el fixture. */
	api: MagiisApiClient;
	/** Config de runtime; por defecto se resuelve desde el entorno (.env.<env>). */
	cfg?: RuntimeConfig;
}

export abstract class TestContext {
	/** Transporte HTTP Magiis — disponible en todos los componentes API. */
	protected readonly api: MagiisApiClient;

	/** Config de runtime (env, baseUrl, ids de prueba, rol). */
	readonly cfg: RuntimeConfig;

	constructor(options: TestContextOptions) {
		this.api = options.api;
		this.cfg = options.cfg ?? getRuntimeConfig();
	}
}
