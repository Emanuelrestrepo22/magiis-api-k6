// tests/fixtures/apiFixture.ts
// Fixture base de la suite api-e2e. Provee `magiisApi` (cliente) y `cfg` (runtime).

import { test as base, expect } from '@playwright/test';
import { MagiisApiClient } from '../clients/magiis-api-client';
import { getRuntimeConfig, type RuntimeConfig } from '../config/runtime';

type Fixtures = {
	magiisApi: MagiisApiClient;
	cfg: RuntimeConfig;
};

export const test = base.extend<Fixtures>({
	cfg: async ({}, use) => {
		await use(getRuntimeConfig());
	},
	magiisApi: async ({ request }, use) => {
		const client = new MagiisApiClient(request);
		await use(client);
	}
});

export { expect };
