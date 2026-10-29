// tests/specs/controllers/payment.api.test.ts
// DRAFT auto-generado · Controller: PaymentController · 3 reqs

import { test, expect } from '@TestBase';

test.describe('PaymentController', () => {
	test('POST addPaymentOfCheckingAccountOfPassenger [carrier/1526/passengerUserId/2748/checkingAccount/payment]', async ({
		magiisApi
	}) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('carrier/1526/passengerUserId/2748/checkingAccount/payment', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST generatedPaymentLink [carrier/1521/paymentLink]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('carrier/1521/paymentLink', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('GET getPaymentLinkByToken [carrier/1521/paymentLink/token/1Oj9hi6Pv6]', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('carrier/1521/paymentLink/token/1Oj9hi6Pv6');
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
