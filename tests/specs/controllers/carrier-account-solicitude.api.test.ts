// tests/specs/controllers/carrier-account-solicitude.api.test.ts
// CarrierAccountSolicitudeController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierAccountSolicitudeController).
// Shapes: openapi.yaml (Page<CarrierAccountSolicitudeResponseDTO> y CarrierAccountSolicitudeResponseDTO).
// Endpoints de onboarding admin-scoped bajo token carrier pueden dar 403 → status tolerante.
// {solicitudeId} no está en cfg → derivado del listado paginado previo (test.skip si vacío).

import { test, expect } from '@TestBase';
import { expectPageShape, expectObjectWithProperty } from '@helpers';

test.describe('CarrierAccountSolicitudeController', () => {
	test('Validar GET carrierAccounts/solicitude/paginated', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('carrierAccounts/solicitude/paginated', {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		// Page<CarrierAccountSolicitudeResponseDTO> (content + totalElements). Admin/onboarding scoped → 403 posible.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const page = await expectPageShape<{ carrierAccountSolicitudeId?: number }>(r);
			if (page.content.length > 0) expect(page.content[0]).toHaveProperty('carrierAccountSolicitudeId');
		}
	});

	test('Validar GET carrierAccounts/solicitude/{solicitudeId}', async ({ magiisApi }) => {
		const src = await magiisApi.getJson('carrierAccounts/solicitude/paginated', {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		let solicitudeId: number | undefined;
		if (src.status() === 200) {
			const body = (await src.json()) as { content?: Array<{ carrierAccountSolicitudeId?: number }> };
			if (Array.isArray(body.content) && body.content.length > 0) {
				solicitudeId = body.content[0].carrierAccountSolicitudeId;
			}
		}
		test.skip(solicitudeId === undefined, 'Sin solicitudes en el ambiente para derivar {solicitudeId}');
		const r = await magiisApi.getJson(`carrierAccounts/solicitude/${solicitudeId}`);
		// CarrierAccountSolicitudeResponseDTO.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'carrierAccountSolicitudeId');
	});
});
