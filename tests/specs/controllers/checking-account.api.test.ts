// tests/specs/controllers/checking-account.api.test.ts
// CheckingAccountController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (CheckingAccountController) + openapi.yaml.
// Shapes derivados de components.schemas / responses de cada endpoint en openapi.yaml.
// Nota: `carrier/{carrierId}/clients/totals` está documentado en openapi.yaml pero no listado
//       en el catálogo BE; se incluye por estar en el contrato.
// Path param carrierId = cfg.carrierId. Sin endpoints mutantes (POST/PUT).

import { test, expect } from '@TestBase';
import { expect2xx, expectPageShape, expectObjectWithProperty } from '@helpers';

const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };

test.describe('CheckingAccountController', () => {
	test('Validar GET checking-accounts/carrier/:carrierId/clients/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`checking-accounts/carrier/${cfg.carrierId}/clients/paginated`, {
			params: PAGE_PARAMS
		});
		// carrier-scoped con params paginados requeridos → 200 garantizado. openapi documenta
		// ClientCheckingAccountSummaryResponseDTO (objeto sin campos required) → assert fuerte 2xx + objeto no nulo.
		await expect2xx(r);
		const body = (await r.json()) as unknown;
		expect(typeof body === 'object' && body !== null).toBe(true);
	});

	test('Validar GET checking-accounts/carrier/:carrierId/clients/totals', async ({ magiisApi, cfg }) => {
		// Agregado carrier-scoped → CheckingAccountTotalsResponseDTO. Assert fuerte 2xx + campo real del schema.
		const r = await magiisApi.getJson(`checking-accounts/carrier/${cfg.carrierId}/clients/totals`);
		await expect2xx(r);
		await expectObjectWithProperty(r, 'totalClients');
	});

	test('Validar GET checking-accounts/carrier/:carrierId/owners/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`checking-accounts/carrier/${cfg.carrierId}/owners/paginated`, {
			// backend hace Optional.get() unguarded sobre 'find': sin él → 500 "No value present". find:'' → 200 (confirmado prod).
			params: { ...PAGE_PARAMS, find: '' }
		});
		// OwnerCheckingAccountResponseDTO = { page: Page<OwnerCheckingAccountDTO>, totalBalance }.
		await expectObjectWithProperty(r, 'page');
		await expectObjectWithProperty(r, 'totalBalance');
	});

	test('Validar GET checking-accounts/carrier/:carrierId/drivers/paginated', async ({ magiisApi, cfg }) => {
		// openapi marca `sort` como required en este endpoint → se envía en PAGE_PARAMS.
		const r = await magiisApi.getJson(`checking-accounts/carrier/${cfg.carrierId}/drivers/paginated`, {
			params: PAGE_PARAMS
		});
		// DriverCheckingAccountResponseDTO = { page: Page<DriverCheckingAccountDTO>, totalBalance }.
		await expectObjectWithProperty(r, 'page');
		await expectObjectWithProperty(r, 'totalBalance');
	});

	test('Validar GET checking-accounts/carrier/:carrierId/movements', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`checking-accounts/carrier/${cfg.carrierId}/movements`);
		// MovementsListDto: schema sin propiedades declaradas en openapi → shape mínima cuando 200.
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	test('Validar GET checking-accounts/admin/:carrierId/totals', async ({ magiisApi, cfg }) => {
		// admin-scoped: bajo rol carrier puede responder 403.
		const r = await magiisApi.getJson(`checking-accounts/admin/${cfg.carrierId}/totals`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			// CheckingAccountTotalsOfCarrier
			await expectObjectWithProperty(r, 'total');
		}
	});

	test('Validar GET checking-accounts/admin/:carrierId/detail/paginated', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`checking-accounts/admin/${cfg.carrierId}/detail/paginated`, {
			params: PAGE_PARAMS
		});
		// Respuesta Page<ContractorCheckingAccountDto> (content + totalElements). admin-scoped → 403 posible.
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			await expectPageShape(r);
		}
	});
});
