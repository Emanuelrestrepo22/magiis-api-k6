// tests/specs/controllers/mailchimp-email.api.test.ts
// MailchimpEmailController — cobertura READ-ONLY (solo GET). Integración externa Mailchimp por usuario.
// Rutas exactas: scripts/backend-route-catalog.json (MailchimpEmailController) + openapi.yaml.
// userId = cfg.carrierId (el carrier es un usuario del sistema, mismo criterio que VendorController).
// getTemplates/getTemplateHtml requieren query `carrierId` (int64). templateId no derivable → placeholder.
// Los 200 de estos GET no tienen schema documentado en openapi (y getTemplateHtml devuelve HTML, no JSON) →
//   sólo status tolerante ([200,400,403,404] descarta 5xx); la integración sin configurar devuelve 400/403/404.

import { test, expect } from '@TestBase';

const TOLERANT = [200, 400, 403, 404];

test.describe('MailchimpEmailController', () => {
	test('Validar GET vendor/mailchimp/{userId}/domain/dns-records', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`vendor/mailchimp/${cfg.carrierId}/domain/dns-records`);
		expect(TOLERANT).toContain(r.status());
	});

	test('Validar GET vendor/mailchimp/{userId}/sender', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`vendor/mailchimp/${cfg.carrierId}/sender`);
		expect(TOLERANT).toContain(r.status());
	});

	test('Validar GET vendor/mailchimp/{userId}/sends', async ({ magiisApi, cfg }) => {
		// getSends acepta query opcional `limit`.
		const r = await magiisApi.getJson(`vendor/mailchimp/${cfg.carrierId}/sends`, { params: { limit: 10 } });
		expect(TOLERANT).toContain(r.status());
	});

	test('Validar GET vendor/mailchimp/{userId}/templates', async ({ magiisApi, cfg }) => {
		// getTemplates requiere query carrierId (int64).
		const r = await magiisApi.getJson(`vendor/mailchimp/${cfg.carrierId}/templates`, {
			params: { carrierId: cfg.carrierId }
		});
		expect(TOLERANT).toContain(r.status());
	});

	test('Validar GET vendor/mailchimp/{userId}/templates/{templateId}/html', async ({ magiisApi, cfg }) => {
		// templateId no derivable (sin listado tipado) → placeholder; requiere query carrierId.
		const r = await magiisApi.getJson(`vendor/mailchimp/${cfg.carrierId}/templates/placeholder-template/html`, {
			params: { carrierId: cfg.carrierId }
		});
		expect(TOLERANT).toContain(r.status());
	});
});
