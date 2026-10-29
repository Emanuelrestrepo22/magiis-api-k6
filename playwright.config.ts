// playwright.config.ts
// Config Playwright API-only. NO usa browsers — solo APIRequestContext.
// Backend ref: magiis-be release/v1.72.1. Workspace Postman MAGIIS-QA-API-v2.

import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

// Resuelve .env.<env> según ENV. Ambientes del proyecto: uat|prod (test fuera). Default = uat.
const env = process.env.ENV ?? 'uat';
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
		['junit', { outputFile: 'reports/junit.xml' }],
		// Allure OPT-IN (ALLURE=1) — condicional para no romper el runner default.
		...(process.env.ALLURE ? [['allure-playwright', { resultsDir: 'allure-results', detail: true }]] : []),
		// Xray OPT-IN (XRAY=1) — emite reports/xray-results.json (contrato de consistencia del portafolio).
		...(process.env.XRAY
			? [['./tests/utils/reporters/xray-reporter.ts', { outputFile: 'reports/xray-results.json' }]]
			: [])
	] as import('@playwright/test').ReporterDescription[],
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
