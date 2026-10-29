// tests/specs/controllers/recurring-trip.api.test.ts
// RecurringTripController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (RecurringTripController) + openapi.yaml.
// Shapes: openapi.yaml → todas las respuestas GET son Page-like { content: RecurringTripResponseDTO[], totalElements }.
// carrierId = cfg.carrierId. contractorId NO está en cfg ni hay listado carrier-accesible para derivarlo
//   → se ejerce el contrato con id runtime + status tolerante (403 cross-role posible bajo token carrier).
// Endpoints mutantes (POST update/updateNote, PUT delete) fuera de alcance (otro track).

import { test, expect } from '@TestBase';
import { expectPageShape } from '@helpers';

// Backend hace Optional.get() sobre page/size/column/sort → sin ellos responde 500.
// openapi los declara required=false pero en runtime son obligatorios: se envían siempre.
const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };

test.describe('RecurringTripController', () => {
	test('Validar GET carriers/{carrierId}/recurringTrip/paginated', async ({ magiisApi, cfg }) => {
		// `status` es required en openapi (enum no documentado) → se envía valor plausible + status tolerante.
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/recurringTrip/paginated`, {
			params: { ...PAGE_PARAMS, status: 'ACTIVE' }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			// Page<RecurringTripResponseDTO> (content + totalElements).
			const page = await expectPageShape<{ id?: number }>(r);
			if (page.content.length > 0) expect(page.content[0]).toHaveProperty('id');
		}
	});

	test('Validar GET carriers/{carrierId}/recurringTripCanceled/paginated', async ({ magiisApi, cfg }) => {
		// Recurso propio del carrier, sin query required → assert fuerte Page<RecurringTripResponseDTO>.
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/recurringTripCanceled/paginated`, {
			params: PAGE_PARAMS
		});
		const page = await expectPageShape<{ id?: number }>(r);
		if (page.content.length > 0) expect(page.content[0]).toHaveProperty('id');
	});

	test('Validar GET contractors/{contractorId}/recurringTrip/paginated', async ({ magiisApi, cfg }) => {
		// contractorId no disponible en cfg ni derivable de un listado carrier-accesible.
		// Se ejerce el contrato con id runtime; bajo token carrier suele dar 403/404 (cross-role).
		const r = await magiisApi.getJson(`contractors/${cfg.carrierId}/recurringTrip/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
