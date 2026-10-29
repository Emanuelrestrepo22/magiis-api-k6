// tests/specs/controllers/carrier-user-liquidation.api.test.ts
// CarrierUserLiquidationController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierUserLiquidationController) + openapi.yaml.
// carrierId = cfg.carrierId. passengerUserId / liquidationId se derivan de findPassengers
//   (ListCarrierUserDTO → page.content[].passengerUserId / .lastLiquidationId); test.skip si vacío.
// Endpoints que solo dependen de carrierId → assert fuerte. Los que requieren id derivado o son
//   passenger-scoped → tolerante [200,400,403,404] (no-5xx) + shape si 200.
// Shapes derivados de components.schemas del openapi.yaml. Sin endpoints mutantes (POST/PUT).

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };
const FROM = '2020-01-01T00:00:00.000Z';
const TO = '2030-01-01T00:00:00.000Z';

type PassengerRefs = { passengerUserId?: number; liquidationId?: number };

// Deriva un passengerUserId real y su última liquidación desde findPassengers (carrier-scoped).
async function derivePassengerRefs(api: MagiisApiClient, carrierId: number): Promise<PassengerRefs> {
	const r = await api.getJson(`carrierUserLiquidations/findPassengers/${carrierId}/paginated`, { params: PAGE_PARAMS });
	if (r.status() !== 200) return {};
	const body = (await r.json()) as {
		page?: { content?: Array<{ passengerUserId?: number; lastLiquidationId?: number }> };
	};
	const first = body.page?.content?.[0];
	return { passengerUserId: first?.passengerUserId, liquidationId: first?.lastLiquidationId };
}

test.describe('CarrierUserLiquidationController', () => {
	// ─── carrier-scoped (solo cfg.carrierId) → assert fuerte ──────────────────────

	test('Validar GET carrierUserLiquidations/:carrierId/paginated', async ({ magiisApi, cfg }) => {
		// getLiquidations → Page<CarrierUserLiquidationDTO> (content/totalElements top-level).
		const r = await magiisApi.getJson(`carrierUserLiquidations/${cfg.carrierId}/paginated`, { params: PAGE_PARAMS });
		await expectPageShape(r);
	});

	test('Validar GET carrierUserLiquidations/findPassengers/:carrierId/paginated', async ({ magiisApi, cfg }) => {
		// getPassengerWithLiquidations → ListCarrierUserDTO { page, totalConsolidated }.
		const r = await magiisApi.getJson(`carrierUserLiquidations/findPassengers/${cfg.carrierId}/paginated`, {
			params: PAGE_PARAMS
		});
		await expectObjectWithProperty(r, 'page');
	});

	// ─── passengerUserId derivado ────────────────────────────────────────────────

	// BUG backend: 500 Internal Server Error en getCarriersWithLiquidations con passengerUserId válido + PAGE_PARAMS
	// (confirmado en prod carrier 1040, pid 105; no lo arregla find:''). Ver BACKLOG hallazgo backend.
	test.fixme('Validar GET carrierUserLiquidations/findCarriers/:passengerUserId/paginated', async ({
		magiisApi,
		cfg
	}) => {
		// getCarriersWithLiquidations → Page<CarrierUserLiquidationSummaryDTO>. Vista passenger-scoped → tolerante (403 posible).
		const { passengerUserId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(passengerUserId === undefined, 'Sin passengers con liquidaciones para derivar {passengerUserId}');
		const r = await magiisApi.getJson(`carrierUserLiquidations/findCarriers/${passengerUserId}/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET carrierUserLiquidations/byPassengerUser/:passengerUserId/paginated', async ({ magiisApi, cfg }) => {
		// getLiquidationsByPassenger → Page<CarrierUserLiquidationDTO>.
		const { passengerUserId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(passengerUserId === undefined, 'Sin passengers con liquidaciones para derivar {passengerUserId}');
		const r = await magiisApi.getJson(`carrierUserLiquidations/byPassengerUser/${passengerUserId}/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET carrierUserLiquidations/byCarrier/:carrierId/passengerUserId/:passengerUserId/:from/:to/paginated', async ({
		magiisApi,
		cfg
	}) => {
		// getLiquidationsByPassengerAndCarrier → Page<CarrierUserLiquidationDTO>.
		const { passengerUserId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(passengerUserId === undefined, 'Sin passengers con liquidaciones para derivar {passengerUserId}');
		const r = await magiisApi.getJson(
			`carrierUserLiquidations/byCarrier/${cfg.carrierId}/passengerUserId/${passengerUserId}/${FROM}/${TO}/paginated`,
			{ params: PAGE_PARAMS }
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET carrierUserLiquidations/:carrierId/history/initialData/:passengerUserId', async ({
		magiisApi,
		cfg
	}) => {
		// getPassengerLiquidationHistoryInitialData → UserLiquidationInitialDataDTO.
		const { passengerUserId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(passengerUserId === undefined, 'Sin passengers con liquidaciones para derivar {passengerUserId}');
		const r = await magiisApi.getJson(
			`carrierUserLiquidations/${cfg.carrierId}/history/initialData/${passengerUserId}`
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierUserLiquidations/initialData/carrier/:carrierId/passengerUser/:passengerUserId', async ({
		magiisApi,
		cfg
	}) => {
		// getUserLiquidationInitialData → UserLiquidationInitialDataDTO { carrierName, startDate, userFirstName, userLastName }.
		const { passengerUserId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(passengerUserId === undefined, 'Sin passengers con liquidaciones para derivar {passengerUserId}');
		const r = await magiisApi.getJson(
			`carrierUserLiquidations/initialData/carrier/${cfg.carrierId}/passengerUser/${passengerUserId}`
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierUserLiquidations/travels/withoutLiquidations/:carrierId/:passengerUserId/:to', async ({
		magiisApi,
		cfg
	}) => {
		// getTravelWithoutLiquidation → array de CarrierUserLiquidationTravelDTO.
		// La op sólo declara page/size (sin column/sort); el backend hace Optional.get() sobre ellos.
		const { passengerUserId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(passengerUserId === undefined, 'Sin passengers con liquidaciones para derivar {passengerUserId}');
		const r = await magiisApi.getJson(
			`carrierUserLiquidations/travels/withoutLiquidations/${cfg.carrierId}/${passengerUserId}/${TO}`,
			{ params: { page: 1, size: 10 } }
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectArray(r);
	});

	// ─── liquidationId derivado (lastLiquidationId de findPassengers) ──────────────

	test('Validar GET carrierUserLiquidations/:liquidationId', async ({ magiisApi, cfg }) => {
		// getById → CarrierUserLiquidationDTO.
		const { liquidationId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierUserLiquidations/${liquidationId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierUserLiquidations/getLiquidationDetails/:liquidationId', async ({ magiisApi, cfg }) => {
		// getLiquidationDetails → CarrierUserLiquidationDetailsDTO.
		const { liquidationId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierUserLiquidations/getLiquidationDetails/${liquidationId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierUserLiquidations/getLiquidationTravelsDetails/:liquidationId', async ({
		magiisApi,
		cfg
	}) => {
		// getLiquidationTravelsDetails → Page<CarrierUserLiquidationTravelDTO>.
		const { liquidationId } = await derivePassengerRefs(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierUserLiquidations/getLiquidationTravelsDetails/${liquidationId}`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
