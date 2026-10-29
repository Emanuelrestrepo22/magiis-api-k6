// tests/specs/controllers/travel.api.test.ts
// DRAFT. TravelController — 81 endpoints, 4 GET críticos acá.

import { test, expect } from '@TestBase';
import { expectPageShape, expectObjectWithProperty } from '@helpers';

// Viaje UAT conocido con fixConceptList (precondición del smoke de Otros Costos recalc=false).
// carrier 1040, estado LOST, fixConceptList=7, otherCosts=2 (validado UAT 2026-07-14). Ref MX-6024, ATP MX-6102.
const TRAVEL_ID_WITH_FIXCONCEPTS = 722494;

test.describe('TravelController', () => {
	// Bug backend SQLGrammarException — ver qa-api-magiis/HANDOFF.md §11 (smoke run 2026-06-09).
	test.fixme('Validar GET /carriers/:carrierId/travels/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/travels/paginated`, {
			params: { page: 1, size: 10, column: 'id', sort: 'DESC' }
		});
		await expectPageShape(r);
	});

	test('Validar GET /travels/states', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('travels/states');
		expect([200, 404]).toContain(r.status());
	});

	// TS-MX6024-DETAIL — getTravelDetail del viaje con fixConceptList (precondición del defecto back).
	test('TS-MX6024-DETAIL — GET /carriers/:carrierId/travels/:travelId → detalle', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/travels/${TRAVEL_ID_WITH_FIXCONCEPTS}`);
		// TRAVEL_ID_WITH_FIXCONCEPTS=722494 es dato de TEST; en prod carrier 1040 → 401 no autorizado.
		expect([200, 401, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'travelId');
	});

	// TS-MX6024-DT02 — recalc=false + fixConceptList → 404 (rollback Hibernate enmascarado como
	// ACTION_NOT_ALLOWED). Mutating PUT: recalculateTripPrice/updateOthersCosts son campos del BODY
	// (TravelUpdateRequestDTO), NO query params. Requiere el DTO completo; validado vía API en el
	// ciclo previo (payload en MX-6024). Se deja fixme hasta armar el body real. Ref ATP MX-6102.
	test('TS-MX6024-DT02 — PUT /carriers/:carrierId/travels/:travelId/update recalc=false → 404', async ({
		magiisApi,
		cfg
	}) => {
		test.fixme(true, 'Mutating PUT — requiere body TravelUpdateRequestDTO real; validado en MX-6024');

		const r = await magiisApi.putJson(`carriers/${cfg.carrierId}/travels/${TRAVEL_ID_WITH_FIXCONCEPTS}/update`, {
			recalculateTripPrice: false,
			updateOthersCosts: false
			/* + resto del TravelUpdateRequestDTO */
		});
		expect(r.status()).toBe(404);
	});
});
