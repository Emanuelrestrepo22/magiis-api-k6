// tests/specs/_flows/03-travel-readonly-lifecycle.api.test.ts
// DRAFT. Portado de _FLOWS_/03_TravelReadonlyLifecycle.

import { test, expect } from '@TestBase';
import { expectPageShape, expect2xx } from '@helpers';

test.describe.serial('[_flows] 03_TravelReadonlyLifecycle', () => {
	let capturedTravelId: number | null = null;

	// Bug backend: SQLGrammarException en query JPA del repository (release/v1.72.1 contra TEST 2026-06-09).
	// Falla con cualquier `column` válido (id, createdAt). Detalle en qa-api-magiis/HANDOFF.md §11.
	test.fixme('GET /carriers/:carrierId/travels/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/travels/paginated`, {
			params: { page: 1, size: 5, column: 'id', sort: 'DESC' }
		});
		const body = await expectPageShape<{ id: number }>(r);
		if (body.content.length > 0) {
			capturedTravelId = body.content[0].id;
		}
	});

	test('GET /travels/:travelId (detalle)', async ({ magiisApi }) => {
		test.skip(capturedTravelId === null, 'No hay viajes en la lista para inspeccionar');
		const r = await magiisApi.getJson(`travels/${capturedTravelId}`);
		await expect2xx(r);
		const body = (await r.json()) as { id?: number };
		expect(body.id).toBe(capturedTravelId);
	});
});
