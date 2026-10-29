// tests/specs/controllers/affi-checking-account.api.test.ts
// AffiCheckingAccountController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (AffiCheckingAccountController) + openapi.yaml.
// Módulo de cuentas corrientes de afiliados (admin/affiliate-scoped) → bajo rol carrier puede responder 403
//   → aserciones tolerantes [200,400,403,404] (el set ya excluye 5xx del backend).
// checkingAccId/affiliateId no son derivables del contrato (AffiCheckingAccountPageDTO tiene properties {})
//   → valor de sondeo (PROBE_ID) + tolerante. carrierId (balances) = cfg.carrierId.
// Shapes: AffiCCCompanyCountryDTO, AffiPaymentMethodDTO, AffiCCLiquidationDTO, Page inline (content/totalElements).
// Endpoints mutantes (POST createCheckingAccount/addLiquidation/addMovement, DELETE) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';

const PAGE_PARAMS = { page: 0, size: 10 };
// checkingAccId/affiliateId/typeview no derivables del contrato → sondeo + tolerante.
const PROBE_ID = 1;
const PROBE_TYPEVIEW = 'ALL';

test.describe('AffiCheckingAccountController', () => {
	test('Validar GET affiCheckingAccount/companies', async ({ magiisApi }) => {
		// getCompanies → array<AffiCCCompanyCountryDTO>. Afiliado-scoped → 403 posible.
		const r = await magiisApi.getJson('affiCheckingAccount/companies');
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ companyCode?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('companyCode');
		}
	});

	test('Validar GET affiCheckingAccount/getAffiliateCheckingAccountPaymentMethodsManual', async ({ magiisApi }) => {
		// getAffiliateCheckingAccountPaymentMethodsManual → array<AffiPaymentMethodDTO>.
		const r = await magiisApi.getJson('affiCheckingAccount/getAffiliateCheckingAccountPaymentMethodsManual');
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ methodName?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('methodName');
		}
	});

	test('Validar GET affiCheckingAccount/getPaymentMethods', async ({ magiisApi }) => {
		// getPaymentMethods → array<string>.
		const r = await magiisApi.getJson('affiCheckingAccount/getPaymentMethods');
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<string>(r);
			if (list.length > 0) expect(typeof list[0]).toBe('string');
		}
	});

	test('Validar GET affiCheckingAccount/paginated', async ({ magiisApi, cfg }) => {
		// getCheckingAccountBalancesPaginated → AffiCheckingAccountPageDTO (schema sin campos) → shape mínima si 200.
		const r = await magiisApi.getJson('affiCheckingAccount/paginated', {
			params: { carrierId: cfg.carrierId, ...PAGE_PARAMS }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	test('Validar GET affiCheckingAccount/{checkingAccId}/getMovementPendingPaginated', async ({ magiisApi }) => {
		// getMovementPendingPaginated → AffiCheckingAccountMovementPendingPageDTO (schema sin campos) → shape mínima si 200.
		const r = await magiisApi.getJson(`affiCheckingAccount/${PROBE_ID}/getMovementPendingPaginated`, {
			params: { affiliateId: PROBE_ID, ...PAGE_PARAMS }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	test('Validar GET affiCheckingAccount/{checkingAccId}/liquidation/{liquidationId}', async ({ magiisApi }) => {
		// getLiquidation → AffiCCLiquidationDTO (id). checkingAccId/liquidationId/affiliateId no derivables → probe + tolerante.
		const r = await magiisApi.getJson(`affiCheckingAccount/${PROBE_ID}/liquidation/${PROBE_ID}`, {
			params: { affiliateId: PROBE_ID, ...PAGE_PARAMS }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	test('Validar GET affiCheckingAccount/{checkingAccId}/liquidations/paginated', async ({ magiisApi }) => {
		// getLiquidationsPaginated → Page<AffiCCLiquidationDTO> (content/totalElements). affiliateId y typeview required → probe.
		const r = await magiisApi.getJson(`affiCheckingAccount/${PROBE_ID}/liquidations/paginated`, {
			params: { affiliateId: PROBE_ID, typeview: PROBE_TYPEVIEW, ...PAGE_PARAMS }
		});
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
