// playwright.config.ts
// Config Playwright API-only. NO usa browsers — solo APIRequestContext.
// Config Playwright API-only — apunta al backend vía env (BASE_URL/MAGIIS_API_PREFIX).

import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

// Resuelve .env.<env> según ENV (test|uat|prod). Default = test.
const env = process.env.ENV ?? 'test';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

export default defineConfig({
	testDir: './tests/specs',
	testMatch: '**/*.api.test.ts',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	fullyParallel: false, // muchos endpoints comparten estado de DB; serializar por default
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : 4,
	reporter: [
		['list'],
		['html', { outputFolder: 'reports/html', open: 'never' }],
		['junit', { outputFile: 'reports/junit.xml' }]
	],
	use: {
		// baseURL se resuelve dentro de los specs vía MagiisApiClient + runtime config.
		// No lo seteamos acá para no fijar el prefijo de Magiis (que cambia entre versiones).
		extraHTTPHeaders: {
			Accept: 'application/json'
		},
		trace: 'on-first-retry',
		// Sin browser context — API only.
		ignoreHTTPSErrors: true
	},
	projects: [
		{
			name: 'api',
			testDir: './tests/specs'
		}
	]
});
