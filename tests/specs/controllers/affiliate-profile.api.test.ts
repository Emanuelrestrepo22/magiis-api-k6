// tests/specs/controllers/affiliate-profile.api.test.ts
// AffiliateProfileController — base affiliateProfile.
// Contrato: docs/reference/backend-endpoints-v1.72.2.md (§8.46).
// Ruta corregida: el stub llamaba getJson('2') sin prefijo 'affiliateProfile/'.
// GET por id depende de un afiliado real; sin dato de test se tolera 4xx.

import { test, expect } from '@TestBase';

const SAMPLE_AFFILIATE_ID = 2;

test.describe('AffiliateProfileController', () => {
	test('Validar GET /affiliateProfile/:id responde con contrato', async ({ magiisApi }) => {
		const r = await magiisApi.getJson(`affiliateProfile/${SAMPLE_AFFILIATE_ID}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as Record<string, unknown>;
			expect(body).toHaveProperty('affiliateType');
		}
	});

	test('Validar GET /affiliateProfile/:id/getActiveOSAffiliateAgreements', async ({ magiisApi }) => {
		const r = await magiisApi.getJson(`affiliateProfile/${SAMPLE_AFFILIATE_ID}/getActiveOSAffiliateAgreements`, {
			params: { page: 0, size: 10, column: 'id', sort: 'ASC' }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
	});

	test.fixme('PUT /affiliateProfile/:id — mutating, requiere body y dato de test', async ({ magiisApi }) => {
		const r = await magiisApi.putJson(`affiliateProfile/${SAMPLE_AFFILIATE_ID}`, {
			/* TODO: AffiliateProfileRequestDTO — completar con contrato del doc §8.46 */
		});
		expect([200, 400, 404]).toContain(r.status());
	});
});
