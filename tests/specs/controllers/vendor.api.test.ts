// tests/specs/controllers/vendor.api.test.ts
// VendorController — cobertura READ-ONLY (solo GET). Controller mayormente mutante: POST/DELETE de
//   integraciones (authorize, stripe, mercadopago, square, ebiz, mailchimp) → fuera de alcance (otro track).
// GET cubiertos (todos Mailchimp, integración externa por usuario):
//   - vendor/mailchimp/{userId}/lists                    → MailchimpAudiencesResponseDTO (lists/total_items)
//   - vendor/mailchimp/{userId}/batches/{batchId}        → schema vacío {}
//   - vendor/mailchimp/{userId}/sync/{syncLogId}/status  → MailchimpSyncStatusResponseDTO (status/syncLogId...)
// Rutas exactas: scripts/backend-route-catalog.json (VendorController) + openapi.yaml.
// userId = cfg.carrierId (el carrier es un usuario del sistema). batchId/syncLogId NO están en cfg ni hay
//   listado para derivarlos → placeholder + status tolerante: la integración sin configurar en el ambiente
//   devuelve 400/403/404; el 200 depende de datos reales de Mailchimp.

import { test, expect } from '@TestBase';
import { expectObjectWithProperty } from '@helpers';

test.describe('VendorController', () => {
	// fixme: Integración externa Mailchimp sin config para carrier 1040 (500).
	test.fixme('Validar GET vendor/mailchimp/{userId}/lists', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`vendor/mailchimp/${cfg.carrierId}/lists`);
		// Integración externa por usuario → tolerante; si 200, MailchimpAudiencesResponseDTO expone `lists`.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'lists');
	});

	// fixme: Mailchimp externo con batchId placeholder → 500 en UAT (robustez, debería 4xx). Misma clase BE-10.
	test.fixme('Validar GET vendor/mailchimp/{userId}/batches/{batchId}', async ({ magiisApi, cfg }) => {
		// batchId no derivable (sin listado) → placeholder; schema de respuesta vacío → body truthy si 200.
		const r = await magiisApi.getJson(`vendor/mailchimp/${cfg.carrierId}/batches/placeholder-batch`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	test('Validar GET vendor/mailchimp/{userId}/sync/{syncLogId}/status', async ({ magiisApi, cfg }) => {
		// syncLogId no derivable (sin listado) → placeholder numérico; si 200, MailchimpSyncStatusResponseDTO → `status`.
		const r = await magiisApi.getJson(`vendor/mailchimp/${cfg.carrierId}/sync/0/status`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'status');
	});
});
