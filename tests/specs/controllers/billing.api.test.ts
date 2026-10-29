// tests/specs/controllers/billing.api.test.ts
// BillingController — cobertura READ-ONLY. Solo GET.
// Rutas: scripts/backend-route-catalog.json (BillingController).
// Shapes: openapi.yaml (components.schemas / responses de cada endpoint).
// Path params sin dato en cfg (liquidationId, idReport, settlement id) → derivados de un
// listado previo o test.skip; endpoints carrier-scoped/dependientes de datos → status tolerante.

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty, expectNestedPageShape } from '@helpers';

// Params de paginación exigidos por el backend (Optional.get sobre page/size/column/sort → 500 si faltan).
const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };

test.describe('BillingController', () => {
	// ─── Endpoints globales / carrier-scoped con shape fuerte ────────────────────

	test('Validar GET /billing/carriers/summary/paginated tiene shape Page<CarrierBillingSummaryDTO>', async ({
		magiisApi
	}) => {
		const r = await magiisApi.getJson('billing/carriers/summary/paginated', {
			params: { ...PAGE_PARAMS, country: '', find: '' }
		});
		const page = await expectPageShape<{ carrierId?: number; carrierName?: string }>(r);
		if (page.content.length > 0) expect(page.content[0]).toHaveProperty('carrierId');
	});

	test('Validar GET /billing/carriers/summary/totals retorna totalToBill/totalBalance', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('billing/carriers/summary/totals');
		const body = await expectObjectWithProperty<{ totalToBill?: number; totalBalance?: number }>(r, 'totalToBill');
		expect(body).toHaveProperty('totalBalance');
	});

	test('Validar GET /billing/surrender/summary retorna totalAmountSum/commissionAmountSum', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('billing/surrender/summary');
		const body = await expectObjectWithProperty<{ totalAmountSum?: number; commissionAmountSum?: number }>(
			r,
			'totalAmountSum'
		);
		expect(body).toHaveProperty('commissionAmountSum');
	});

	test('Validar GET /billing/surrender/paginated tiene shape Page<CarrierBillingResponseDTO>', async ({
		magiisApi
	}) => {
		const r = await magiisApi.getJson('billing/surrender/paginated', {
			params: { ...PAGE_PARAMS, find: '' }
		});
		const page = await expectPageShape<{ idReport?: number; carrierName?: string }>(r);
		if (page.content.length > 0) expect(page.content[0]).toHaveProperty('idReport');
	});

	test('Validar GET /billing/admin/liquidations/paginated tiene shape Page<ListAdminDTO>', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('billing/admin/liquidations/paginated', {
			params: { ...PAGE_PARAMS, find: '' }
		});
		// Shape real (prod): { page: Page<ListAdminDTO> } → Page anidada bajo .page. Cada fila = carrierId/lastLiquidationId.
		const page = await expectNestedPageShape<{ carrierId?: number; lastLiquidationId?: number }>(r);
		if (page.content.length > 0) expect(page.content[0]).toHaveProperty('carrierId');
	});

	test('Validar GET /billing/admin/carrierServices/searchSettlements retorna array', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('billing/admin/carrierServices/searchSettlements');
		const list = await expectArray<{ id?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	// ─── Carrier-scoped (cfg.carrierId) dependientes de datos → status tolerante ──

	// BUG backend: NullPointerException en billing/carriers/{carrierAccountId}/travels (500 confirmado en prod, carrier 1040).
	test.fixme('Validar GET /billing/carriers/:carrierAccountId/travels (cfg.carrierId)', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`billing/carriers/${cfg.carrierId}/travels`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body).toBe('object');
		}
	});

	test('Validar GET /billing/admin/initialData/:carrierId (cfg.carrierId)', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`billing/admin/initialData/${cfg.carrierId}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body).toBe('object');
		}
	});

	test('Validar GET /billing/admin/history/initialData/:carrierId (cfg.carrierId)', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`billing/admin/history/initialData/${cfg.carrierId}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body).toBe('object');
		}
	});

	test('Validar GET /billing/admin/history/byCarrier/:carrierId/:from/:to/paginated (cfg.carrierId + rango)', async ({
		magiisApi,
		cfg
	}) => {
		const from = '2020-01-01T00:00:00.000Z';
		const to = '2030-01-01T00:00:00.000Z';
		const r = await magiisApi.getJson(`billing/admin/history/byCarrier/${cfg.carrierId}/${from}/${to}/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	// BUG backend: DataException "could not extract ResultSet" (SQL) en withoutLiquidations/paginated (500 confirmado en prod).
	test.fixme('Validar GET /billing/admin/withoutLiquidations/:carrierId/:to/paginated (cfg.carrierId + fecha)', async ({
		magiisApi,
		cfg
	}) => {
		const to = '2030-01-01T00:00:00.000Z';
		const r = await magiisApi.getJson(`billing/admin/withoutLiquidations/${cfg.carrierId}/${to}/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown[];
			expect(Array.isArray(body)).toBe(true);
		}
	});

	// ─── Path params sin dato en cfg → derivados de un listado previo o skip ──────

	test('Validar GET /billing/admin/carrierServices/settlement/:id/detail (id derivado)', async ({ magiisApi }) => {
		const src = await magiisApi.getJson('billing/admin/carrierServices/searchSettlements');
		let id: number | undefined;
		if (src.status() === 200) {
			const arr = (await src.json()) as Array<{ id?: number }>;
			if (Array.isArray(arr) && arr.length > 0) id = arr[0].id;
		}
		test.skip(id === undefined, 'Sin settlements en el ambiente para derivar {id}');
		const r = await magiisApi.getJson(`billing/admin/carrierServices/settlement/${id}/detail`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	test('Validar GET /billing/surrender/detail/:idReport/paginated (idReport derivado)', async ({ magiisApi }) => {
		const src = await magiisApi.getJson('billing/surrender/paginated', { params: { ...PAGE_PARAMS, find: '' } });
		let idReport: number | undefined;
		if (src.status() === 200) {
			const body = (await src.json()) as { content?: Array<{ idReport?: number }> };
			if (Array.isArray(body.content) && body.content.length > 0) idReport = body.content[0].idReport;
		}
		test.skip(idReport === undefined, 'Sin reportes surrender para derivar {idReport}');
		const r = await magiisApi.getJson(`billing/surrender/detail/${idReport}/paginated`, {
			params: { ...PAGE_PARAMS, find: '' }
		});
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET /billing/admin/getLiquidationDetails/:liquidationId (liquidationId derivado)', async ({
		magiisApi
	}) => {
		const src = await magiisApi.getJson('billing/admin/liquidations/paginated', {
			params: { ...PAGE_PARAMS, find: '' }
		});
		let liquidationId: number | undefined;
		if (src.status() === 200) {
			const body = (await src.json()) as { page?: { content?: Array<{ lastLiquidationId?: number }> } };
			liquidationId = body.page?.content?.[0]?.lastLiquidationId;
		}
		test.skip(liquidationId === undefined, 'Sin liquidaciones en el ambiente para derivar {liquidationId}');
		const r = await magiisApi.getJson(`billing/admin/getLiquidationDetails/${liquidationId}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(typeof body).toBe('object');
		}
	});

	test('Validar GET /billing/admin/liquidation/detail/:liquidationId/paginated (liquidationId derivado)', async ({
		magiisApi
	}) => {
		const src = await magiisApi.getJson('billing/admin/liquidations/paginated', {
			params: { ...PAGE_PARAMS, find: '' }
		});
		let liquidationId: number | undefined;
		if (src.status() === 200) {
			const body = (await src.json()) as { page?: { content?: Array<{ lastLiquidationId?: number }> } };
			liquidationId = body.page?.content?.[0]?.lastLiquidationId;
		}
		test.skip(liquidationId === undefined, 'Sin liquidaciones en el ambiente para derivar {liquidationId}');
		const r = await magiisApi.getJson(`billing/admin/liquidation/detail/${liquidationId}/paginated`, {
			params: PAGE_PARAMS
		});
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
