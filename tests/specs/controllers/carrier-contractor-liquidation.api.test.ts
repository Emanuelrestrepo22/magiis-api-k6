// tests/specs/controllers/carrier-contractor-liquidation.api.test.ts
// CarrierContractorLiquidationController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CarrierContractorLiquidationController) + openapi.yaml.
// carrierId = cfg.carrierId. contractorId / liquidationId se derivan de findContractors
//   (ListContractorAccountDTO → page.content[].contractorId / .lastLiquidationId); test.skip si vacío.
// Endpoints que solo dependen de carrierId → assert fuerte. Los que requieren id derivado o son
//   contractor-scoped → tolerante [200,400,403,404] (no-5xx) + shape si 200.
// Shapes derivados de components.schemas del openapi.yaml. Sin endpoints mutantes (POST/PUT).

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };
const FROM = '2020-01-01T00:00:00.000Z';
const TO = '2030-01-01T00:00:00.000Z';

type ContractorRefs = { contractorId?: number; liquidationId?: number };

// Deriva un contractorId real y su última liquidación desde findContractors (carrier-scoped).
async function deriveContractorRefs(api: MagiisApiClient, carrierId: number): Promise<ContractorRefs> {
	const r = await api.getJson(`carrierContractorLiquidations/findContractors/${carrierId}/paginated`, {
		params: PAGE_PARAMS
	});
	if (r.status() !== 200) return {};
	const body = (await r.json()) as {
		page?: { content?: Array<{ contractorId?: number; lastLiquidationId?: number }> };
	};
	const first = body.page?.content?.[0];
	return { contractorId: first?.contractorId, liquidationId: first?.lastLiquidationId };
}

test.describe('CarrierContractorLiquidationController', () => {
	// ─── carrier-scoped (solo cfg.carrierId) → assert fuerte ──────────────────────

	test('Validar GET carrierContractorLiquidations/:carrierId/paginated', async ({ magiisApi, cfg }) => {
		// getLiquidations → Page<CarrierContractorLiquidationDTO> (content/totalElements top-level).
		const r = await magiisApi.getJson(`carrierContractorLiquidations/${cfg.carrierId}/paginated`, {
			params: PAGE_PARAMS
		});
		await expectPageShape(r);
	});

	test('Validar GET carrierContractorLiquidations/findContractors/:carrierId/paginated', async ({ magiisApi, cfg }) => {
		// getContractorsWithLiquidations → ListContractorAccountDTO { page, totalConsolidated }.
		const r = await magiisApi.getJson(`carrierContractorLiquidations/findContractors/${cfg.carrierId}/paginated`, {
			params: PAGE_PARAMS
		});
		await expectObjectWithProperty(r, 'page');
	});

	// ─── contractorId derivado ────────────────────────────────────────────────────

	test('Validar GET carrierContractorLiquidations/findCarriers/:contractorId/paginated', async ({ magiisApi, cfg }) => {
		// getCarriersWithLiquidations → Page<CarrierAccountDTO>. Vista contractor-scoped → tolerante (403 posible).
		const { contractorId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(contractorId === undefined, 'Sin contractors con liquidaciones para derivar {contractorId}');
		const r = await magiisApi.getJson(`carrierContractorLiquidations/findCarriers/${contractorId}/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET carrierContractorLiquidations/checkingAccount/carrier/:carrierId/contractor/:contractorId', async ({
		magiisApi,
		cfg
	}) => {
		// getCheckingAccountByRelation → CarrierAccountDTO.
		const { contractorId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(contractorId === undefined, 'Sin contractors con liquidaciones para derivar {contractorId}');
		const r = await magiisApi.getJson(
			`carrierContractorLiquidations/checkingAccount/carrier/${cfg.carrierId}/contractor/${contractorId}`
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'carrierId');
	});

	test('Validar GET carrierContractorLiquidations/:carrierId/initialData/:contractorId', async ({ magiisApi, cfg }) => {
		// getContractorLiquidationInitialData → ContractorLiquidationInitialDataDTO { carrierName, contractorName, startDate }.
		const { contractorId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(contractorId === undefined, 'Sin contractors con liquidaciones para derivar {contractorId}');
		const r = await magiisApi.getJson(`carrierContractorLiquidations/${cfg.carrierId}/initialData/${contractorId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierContractorLiquidations/:carrierId/history/initialData/:contractorId', async ({
		magiisApi,
		cfg
	}) => {
		// getContractorLiquidationHistoryInitialData → ContractorLiquidationInitialDataDTO.
		const { contractorId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(contractorId === undefined, 'Sin contractors con liquidaciones para derivar {contractorId}');
		const r = await magiisApi.getJson(
			`carrierContractorLiquidations/${cfg.carrierId}/history/initialData/${contractorId}`
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierContractorLiquidations/byContractor/:contractorId/paginated', async ({ magiisApi, cfg }) => {
		// getLiquidationsByContractor → Page<CarrierContractorLiquidationDTO>.
		const { contractorId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(contractorId === undefined, 'Sin contractors con liquidaciones para derivar {contractorId}');
		const r = await magiisApi.getJson(`carrierContractorLiquidations/byContractor/${contractorId}/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET carrierContractorLiquidations/byContractor/:contractorId/carrier/:carrierId/:from/:to/paginated', async ({
		magiisApi,
		cfg
	}) => {
		// getLiquidationsByContractorAndCarrier → Page<CarrierContractorLiquidationDTO>.
		const { contractorId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(contractorId === undefined, 'Sin contractors con liquidaciones para derivar {contractorId}');
		const r = await magiisApi.getJson(
			`carrierContractorLiquidations/byContractor/${contractorId}/carrier/${cfg.carrierId}/${FROM}/${TO}/paginated`,
			{ params: PAGE_PARAMS }
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET carrierContractorLiquidations/travels/withoutLiquidations/:carrierId/:contractorId/:from/:to', async ({
		magiisApi,
		cfg
	}) => {
		// getTravelWithoutLiquidation → array de CarrierContractorLiquidationTravelDTO. page/size query requeridos por backend.
		const { contractorId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(contractorId === undefined, 'Sin contractors con liquidaciones para derivar {contractorId}');
		const r = await magiisApi.getJson(
			`carrierContractorLiquidations/travels/withoutLiquidations/${cfg.carrierId}/${contractorId}/${FROM}/${TO}`,
			{ params: { page: 1, size: 10 } }
		);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectArray(r);
	});

	// ─── liquidationId derivado (lastLiquidationId de findContractors) ─────────────

	test('Validar GET carrierContractorLiquidations/:liquidationId', async ({ magiisApi, cfg }) => {
		// getById → CarrierContractorLiquidationDTO.
		const { liquidationId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierContractorLiquidations/${liquidationId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierContractorLiquidations/getLiquidationDetails/:liquidationId', async ({ magiisApi, cfg }) => {
		// getLiquidationDetails → CarrierContractorLiquidationDetailsDTO.
		const { liquidationId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierContractorLiquidations/getLiquidationDetails/${liquidationId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body === 'object' && body !== null).toBe(true);
		}
	});

	test('Validar GET carrierContractorLiquidations/getLiquidationTravelsDetails/:liquidationId', async ({
		magiisApi,
		cfg
	}) => {
		// getLiquidationTravelsDetails → Page<CarrierContractorLiquidationTravelDTO>.
		const { liquidationId } = await deriveContractorRefs(magiisApi, cfg.carrierId);
		test.skip(liquidationId === undefined, 'Sin liquidaciones para derivar {liquidationId}');
		const r = await magiisApi.getJson(`carrierContractorLiquidations/getLiquidationTravelsDetails/${liquidationId}`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
