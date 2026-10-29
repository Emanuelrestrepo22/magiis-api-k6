// tests/specs/controllers/carrier-concept-tax.api.test.ts
// CarrierConceptTaxController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierConceptTaxController) + openapi.yaml.
// Shapes contra components.schemas:
//   - CarrierConceptTaxResponseDTO  = { concepts[], taxes[], version, versionDate }
//   - CarrierConceptTaxForDriverResponseDTO = { concepts[] }
// Path param carrierId = cfg.carrierId. Endpoints POST/PUT del controller fuera de alcance.

import { test, expect } from '@TestBase';
import { expectObjectWithProperty } from '@helpers';

test.describe('CarrierConceptTaxController', () => {
	test('Validar GET /carriers/{carrierId}/conceptTaxes', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/conceptTaxes`);
		// CarrierConceptTaxResponseDTO → assert fuerte 2xx + campos reales del schema.
		const body = await expectObjectWithProperty<{ concepts?: unknown[]; taxes?: unknown[] }>(r, 'concepts');
		expect(body).toHaveProperty('taxes');
	});

	test('Validar GET /carriers/{carrierId}/conceptTaxesForDriver', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/conceptTaxesForDriver`);
		// CarrierConceptTaxForDriverResponseDTO → { concepts[] }.
		await expectObjectWithProperty(r, 'concepts');
	});
});
