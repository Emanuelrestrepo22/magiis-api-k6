// tests/specs/controllers/whatsapp-business-integration.api.test.ts
// WhatsappBusinessIntegrationController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (WhatsappBusinessIntegrationController).
// openapi.yaml no declara schema de respuesta para estos GET (solo '200: OK') → shape mínima (body definido) si 200.
// carrierId = cfg.carrierId. Config puede no existir (404) o ser admin-scoped (403) → status tolerante.

import { test, expect } from '@TestBase';

test.describe('WhatsappBusinessIntegrationController', () => {
	test('Validar GET api/whatsapp-business/carriers/{carrierId}', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`api/whatsapp-business/carriers/${cfg.carrierId}`);
		// getCarrierConfig — sin schema declarado; data-dependiente. 404 si el carrier no tiene config.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body !== undefined && body !== null).toBe(true);
		}
	});

	test('Validar GET api/whatsapp-business/carriers/{carrierId}/scheduled-trips-status', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`api/whatsapp-business/carriers/${cfg.carrierId}/scheduled-trips-status`);
		// getScheduledTripsStatus — sin schema declarado; data-dependiente. 404 si el carrier no tiene config.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body !== undefined && body !== null).toBe(true);
		}
	});
});
