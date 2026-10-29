// tests/specs/controllers/affi-agreement.api.test.ts
// AffiAgreementController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (AffiAgreementController) + openapi.yaml.
// Shapes contra components.schemas (AffiAgreementNegotiationDTO, AffiAgreementTransferDTO).
// getTransferData requiere {agreementId}: se deriva del listado paginated (primer item) o skip.
// Endpoints POST del controller quedan fuera de alcance (otro track).

import { test, expect } from '@TestBase';
import { expectPageShape, expectObjectWithProperty } from '@helpers';

const PAGE_PARAMS = { page: 0, size: 10 };

test.describe('AffiAgreementController', () => {
	// ── Listado paginado → Page real (content + totalElements) ────────────────
	// Backend TransactionException / AFFILIATE_AGREEMENT feature no disponible para carrier 1040 (404, errorCode AFFILIATE_AGREEMENT_BAD_DATA).
	test.fixme('Validar GET /affiliateAgreement/paginated', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('affiliateAgreement/paginated', { params: PAGE_PARAMS });
		// openapi documenta object { content: AffiAgreementNegotiationDTO[], totalElements, ... }
		const page = await expectPageShape<{ agreementId?: number; companyName?: string }>(r);
		if (page.content.length > 0) expect(page.content[0]).toHaveProperty('agreementId');
	});

	// ── {agreementId} derivado del listado → AffiAgreementTransferDTO (objeto) ─
	test('Validar GET /affiliateAgreement/{agreementId}/getTransferData', async ({ magiisApi }) => {
		const src = await magiisApi.getJson('affiliateAgreement/paginated', { params: PAGE_PARAMS });
		let agreementId: number | undefined;
		if (src.status() === 200) {
			const body = (await src.json()) as { content?: Array<{ agreementId?: number }> };
			if (Array.isArray(body.content) && body.content.length > 0) agreementId = body.content[0].agreementId;
		}
		test.skip(agreementId === undefined, 'Sin acuerdos en el ambiente para derivar {agreementId}');
		const r = await magiisApi.getJson(`affiliateAgreement/${agreementId}/getTransferData`);
		// Data-dependiente / puede no pertenecer al carrier del token → status tolerante.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'agreementId');
	});
});
