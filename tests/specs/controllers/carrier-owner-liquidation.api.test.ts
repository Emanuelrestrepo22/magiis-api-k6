// tests/specs/controllers/carrier-owner-liquidation.api.test.ts
// CarrierOwnerLiquidationController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierOwnerLiquidationController) + openapi.yaml.
// carrierId = cfg.carrierId. ownerId / liquidationId se derivan de findOwners
//   (ListCarrierOwnerDTO → page.content[].ownerId / .lastLiquidationId); test.skip si vacío.
// Endpoints que solo dependen de carrierId → assert fuerte. Los que requieren id derivado →
//   tolerante [200,400,403,404] (no-5xx) + shape si 200.
// Shapes derivados de components.schemas del openapi.yaml. Sin endpoints mutantes (POST/PUT).

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };
const TO = '2030-01-01T00:00:00.000Z';
const FROM = '2020-01-01T00:00:00.000Z';

type OwnerRefs = { ownerId?: number; liquidationId?: number };

// Deriva un ownerId real y su última liquidación desde findOwners (carrier-scoped).
async function deriveOwnerRefs(api: MagiisApiClient, carrierId: number): Promise<OwnerRefs> {
	const r = await api.getJson(`carrierOwnerLiquidations/findOwners/${carrierId}/paginated`, { params: PAGE_PARAMS });
	if (r.status() !== 200) return {};
	const body = (await r.json()) as {
		page?: { content?: Array<{ ownerId?: number; lastLiquidationId?: number }> };
	};
	const first = body.page?.content?.[0];
	return { ownerId: first?.ownerId, liquidationId: first?.lastLiquidationId };
}

test.describe('CarrierOwnerLiquidationController', () => {
	// ─── carrier-scoped (solo cfg.carrierId) → assert fuerte ──────────────────────

	test('Validar GET carrierOwnerLiquidations/:carrierId/findOwners', async ({ magiisApi, cfg }) => {
		// getOwners → array de VehicleOwnerWithLiquidationResponseDTO { name, lastName, ownerId }.
		const r = await magiisApi.getJson(`carrierOwnerLiquidations/${cfg.carrierId}/findOwners`);
		const list = await expectArray<{ ownerId?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('ownerId');
	});

	test('Validar GET carrierOwnerLiquidations/findOwners/:carrierId/paginated', async ({ magiisApi, cfg }) => {
		// getOwnersWithLiquidations → ListCarrierOwnerDTO { page, totalConsolidated }.
		const r = await magiisApi.getJson(`carrierOwnerLiquidations/findOwners/${cfg.carrierId}/paginated`, {
			params: PAGE_PARAMS
		});
		await expectObjectWithProperty(r, 'page');
	});

	// ─── ownerId derivado ──────────────────────────────────────────────────────────

	test('Validar GET carrierOwnerLiquidations/:carrierId/initialData/:ownerId', async ({ magiisApi, cfg }) => {
		// getContractorLiquidationInitialData → LiquidationInitialDataDTO { carrierName, driverName, startDate }.
		const { ownerId } = await deriveOwnerRefs(magiisApi, cfg.carrierId);
		test.skip(ownerId === undefined, 'Sin owners con liquidaciones para derivar {ownerId}');
		const r = await magiisApi.getJson(`carrierOwnerLiquidations/${cfg.carrierId}/initialData/${ownerId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierOwnerLiquidations/:carrierId/history/initialData/:ownerId', async ({ magiisApi, cfg }) => {
		// getOwnerLiquidationHistoryInitialData → UserLiquidationInitialDataDTO.
		const { ownerId } = await deriveOwnerRefs(magiisApi, cfg.carrierId);
		test.skip(ownerId === undefined, 'Sin owners con liquidaciones para derivar {ownerId}');
		const r = await magiisApi.getJson(`carrierOwnerLiquidations/${cfg.carrierId}/history/initialData/${ownerId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierOwnerLiquidations/ownerDetail/:carrierId/ownerId/:ownerId', async ({ magiisApi, cfg }) => {
		// getOwnerDetailLiquidationSmall → CarrierOwnerLiquidationSummaryDTO.
		const { ownerId } = await deriveOwnerRefs(magiisApi, cfg.carrierId);
		test.skip(ownerId === undefined, 'Sin owners con liquidaciones para derivar {ownerId}');
		const r = await magiisApi.getJson(`carrierOwnerLiquidations/ownerDetail/${cfg.carrierId}/ownerId/${ownerId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierOwnerLiquidations/byCarrier/:carrierId/ownerId/:ownerId/:from/:to/paginated', async ({
		magiisApi,
		cfg
	}) => {
		// getLiquidationsByPassengerAndCarrier → Page<CarrierOwnerLiquidationDTO>.
		const { ownerId } = await deriveOwnerRefs(magiisApi, cfg.carrierId);
		test.skip(ownerId === undefined, 'Sin owners con liquidaciones para derivar {ownerId}');
		const r = await magiisApi.getJson(
			`carrierOwnerLiquidations/byCarrier/${cfg.carrierId}/ownerId/${ownerId}/${FROM}/${TO}/paginated`,
			{ params: PAGE_PARAMS }
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET carrierOwnerLiquidations/surrenders/withoutLiquidations/:carrierId/:ownerId/:to', async ({
		magiisApi,
		cfg
	}) => {
		// surrendersReport → array de TravelsSurrenderReportDTO. page/size son query params requeridos.
		const { ownerId } = await deriveOwnerRefs(magiisApi, cfg.carrierId);
		test.skip(ownerId === undefined, 'Sin owners con liquidaciones para derivar {ownerId}');
		const r = await magiisApi.getJson(
			`carrierOwnerLiquidations/surrenders/withoutLiquidations/${cfg.carrierId}/${ownerId}/${TO}`,
			{ params: { page: 1, size: 10 } }
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectArray(r);
	});

	// ─── liquidationId derivado (lastLiquidationId de findOwners) ──────────────────

	test('Validar GET carrierOwnerLiquidations/getLiquidationDetails/:liquidationId', async ({ magiisApi, cfg }) => {
		// getLiquidationDetails → CarrierOwnerLiquidationDetailsDTO.
		const { liquidationId } = await deriveOwnerRefs(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierOwnerLiquidations/getLiquidationDetails/${liquidationId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierOwnerLiquidations/getLiquidationSurrenderDetails/:liquidationId', async ({
		magiisApi,
		cfg
	}) => {
		// getLiquidationSurrenderDetails → Page<TravelsSurrenderReportDTO>.
		const { liquidationId } = await deriveOwnerRefs(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierOwnerLiquidations/getLiquidationSurrenderDetails/${liquidationId}`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
