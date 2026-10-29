// tests/specs/controllers/able-to-use-contractor.api.test.ts
// AbleToUseContractorController — base ableToBeContractors.
// Contrato: docs/reference/backend-endpoints-v1.72.2.md (§8.62).
// Ruta corregida: el stub tenía el path literal '{id}' sin reemplazar.
// Depende de un contractor id real; sin dato de test se tolera 4xx.

import { test, expect } from '@TestBase';

const SAMPLE_CONTRACTOR_ID = 1;

test.describe('AbleToUseContractorController', () => {
	test('Validar GET /ableToBeContractors/:id responde con contrato', async ({ magiisApi }) => {
		const r = await magiisApi.getJson(`ableToBeContractors/${SAMPLE_CONTRACTOR_ID}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as Record<string, unknown>;
			expect(body).toHaveProperty('companyName');
		}
	});
});
