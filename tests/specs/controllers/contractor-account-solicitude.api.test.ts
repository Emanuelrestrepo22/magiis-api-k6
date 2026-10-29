// tests/specs/controllers/contractor-account-solicitude.api.test.ts
// DRAFT auto-generado · Controller: ContractorAccountSolicitudeController · 2 reqs

import { test, expect } from '@TestBase';

test.describe('ContractorAccountSolicitudeController', () => {
	test('POST POST create [contractorAccounts/solicitude]', async ({ magiisApi }) => {
		test.fixme(true, 'Mutating POST — validar antes de quitar fixme');

		const r = await magiisApi.postJson('contractorAccounts/solicitude', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});

	test('PUT PUT confirmSolictude [contractorAccounts/solicitude/{solicitudeId}/confirm/{solicitudeToken}]', async ({
		magiisApi
	}) => {
		test.fixme(true, 'Mutating PUT — validar antes de quitar fixme');

		const r = await magiisApi.putJson('contractorAccounts/solicitude/{solicitudeId}/confirm/{solicitudeToken}', {
			/* TODO body */
		});
		expect([200, 201, 204, 400, 404]).toContain(r.status());
	});
});
