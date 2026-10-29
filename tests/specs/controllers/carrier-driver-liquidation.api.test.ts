// tests/specs/controllers/carrier-driver-liquidation.api.test.ts
// CarrierDriverLiquidationController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierDriverLiquidationController).
// Shapes: openapi.yaml (ListCarrierDriverDTO, LiquidationInitialDataDTO, UserLiquidationInitialDataDTO,
//   CarrierDriverLiquidationDTO inline Page, TravelsSurrenderReportDTO, CarrierDriverLiquidationDetailsDTO).
// carrierId = cfg.carrierId, driverId = cfg.driverId. liquidationId se deriva de getDriversWithLiquidations
//   (page.content[].lastLiquidationId). Endpoints POST/PUT (create, invalidate, report) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

// Rango amplio para los endpoints con fechas en path.
const FROM = '2020-01-01T00:00:00.000Z';
const TO = '2030-01-01T00:00:00.000Z';

// Deriva un liquidationId real desde los drivers con liquidaciones del carrier de runtime.
async function firstLiquidationId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carrierDriverLiquidations/findDrivers/${carrierId}/paginated`, {
		params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
	});
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as { page?: { content?: Array<{ lastLiquidationId?: number }> } };
	return body.page?.content?.[0]?.lastLiquidationId;
}

test.describe('CarrierDriverLiquidationController', () => {
	// ── carrierId = cfg.carrierId → ListCarrierDriverDTO { page, totalConsolidated } (page required) ──
	test('Validar GET carrierDriverLiquidations/findDrivers/{carrierId}/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carrierDriverLiquidations/findDrivers/${cfg.carrierId}/paginated`, {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		await expectObjectWithProperty(r, 'page');
	});

	// ── carrierId + driverId → LiquidationInitialDataDTO (sin campos required) ──────────────────────
	//    El driver de runtime puede no pertenecer al carrier/no tener liquidaciones → status tolerante.
	test('Validar GET carrierDriverLiquidations/{carrierId}/initialData/{driverId}', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carrierDriverLiquidations/${cfg.carrierId}/initialData/${cfg.driverId}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	// ── carrierId + driverId → UserLiquidationInitialDataDTO (sin campos required) ──────────────────
	test('Validar GET carrierDriverLiquidations/{carrierId}/history/initialData/{driverId}', async ({
		magiisApi,
		cfg
	}) => {
		const r = await magiisApi.getJson(`carrierDriverLiquidations/${cfg.carrierId}/history/initialData/${cfg.driverId}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	// ── carrierId + driverId + rango de fechas → inline Page<CarrierDriverLiquidationDTO> ───────────
	test('Validar GET carrierDriverLiquidations/byCarrier/{carrierId}/driverId/{driverId}/{from}/{to}/paginated', async ({
		magiisApi,
		cfg
	}) => {
		const r = await magiisApi.getJson(
			`carrierDriverLiquidations/byCarrier/${cfg.carrierId}/driverId/${cfg.driverId}/${FROM}/${TO}/paginated`,
			{ params: { page: 1, size: 10, column: 'id', sort: 'ASC' } }
		);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	// ── carrierId + driverId + fecha → array<TravelsSurrenderReportDTO> (item id) ───────────────────
	test('Validar GET carrierDriverLiquidations/surrenders/withoutLiquidations/{carrierId}/{driverId}/{to}', async ({
		magiisApi,
		cfg
	}) => {
		const r = await magiisApi.getJson(
			`carrierDriverLiquidations/surrenders/withoutLiquidations/${cfg.carrierId}/${cfg.driverId}/${TO}`,
			{ params: { page: 1, size: 10 } }
		);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	// ── liquidationId derivado → CarrierDriverLiquidationDetailsDTO (sin campos required) ───────────
	test('Validar GET carrierDriverLiquidations/getLiquidationDetails/{liquidationId}', async ({ magiisApi, cfg }) => {
		const liquidationId = await firstLiquidationId(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones de driver en el ambiente para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierDriverLiquidations/getLiquidationDetails/${liquidationId}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	// ── liquidationId derivado → array<TravelsSurrenderReportDTO> (item id) ─────────────────────────
	test('Validar GET carrierDriverLiquidations/getLiquidationSurrenderDetails/{liquidationId}', async ({
		magiisApi,
		cfg
	}) => {
		const liquidationId = await firstLiquidationId(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones de driver en el ambiente para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierDriverLiquidations/getLiquidationSurrenderDetails/${liquidationId}`, {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC' }
		});
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});
});
