// tests/specs/controllers/quote.api.test.ts
// DRAFT auto-generado · Controller: QuoteController · 11 reqs

import { test, expect } from '@TestBase';

test.describe('QuoteController', () => {
	test('POST createQuote [quote]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('quote', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST bookingQuote [quote/220/booking]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('quote/220/booking', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('PUT cancelQuote [quote/218/cancel]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating PUT — validar antes de quitar fixme');

		const r = await magiisApi.putJson('quote/218/cancel', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST confirmQuote [quote/220/confirmToTravel]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('quote/220/confirmToTravel', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('GET detailQuote [carrier/1040/quote/119/detail]', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('carrier/1040/quote/119/detail');
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST updateQuote [quote/220]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('quote/220', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST simulateQuote [simulate]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('simulate', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST reSendNotification [reSendNotification/136]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('reSendNotification/136', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST simulateQuoteByPaymentMethods [simulateAllByPaymentMethods]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('simulateAllByPaymentMethods', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('PUT saveQuoteUse [carrier/1040/use]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating PUT — validar antes de quitar fixme');

		const r = await magiisApi.putJson('carrier/1040/use', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('POST loginQuote [login]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('login', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
