// tests/specs/controllers/affi-ostravel.api.test.ts
// AffiOSTravelController — cobertura READ-ONLY (solo GET). One-shot travel entre afiliados.
// Rutas exactas: scripts/backend-route-catalog.json (AffiOSTravelController) + openapi.yaml.
// Feature affiliate-scoped: el usuario carrier puede no tener perfil afiliado → aserción tolerante
// (incluye 403) que igual descarta 5xx. Shapes contra components.schemas
// (AffiOSAgreementTravelDataDTO, AffiOSTravelRequestedAndReceivedDTO, AffiOSTravelToQuoteDTO).

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';

const PAGE_PARAMS = { page: 0, size: 10 };

test.describe('AffiOSTravelController', () => {
	test('Validar GET affiOneShotTravel/getEstablishedAffiOSTravels', async ({ magiisApi }) => {
		// getEstablishedAffiOSTravels → array de AffiOSAgreementTravelDataDTO. requesterProfileId opcional.
		const r = await magiisApi.getJson('affiOneShotTravel/getEstablishedAffiOSTravels');
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ affiAgreementId?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('affiAgreementId');
		}
	});

	test('Validar GET affiOneShotTravel/received/paginated', async ({ magiisApi }) => {
		// getAffiliateOneShotTravelsReceivedPaginated → Page<AffiOSTravelRequestedAndReceivedDTO>.
		const r = await magiisApi.getJson('affiOneShotTravel/received/paginated', { params: PAGE_PARAMS });
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET affiOneShotTravel/requested/paginated', async ({ magiisApi }) => {
		// getAffiliateOneShotTravelsRequestedPaginated → Page<AffiOSTravelRequestedAndReceivedDTO>.
		const r = await magiisApi.getJson('affiOneShotTravel/requested/paginated', { params: PAGE_PARAMS });
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET affiOneShotTravel/{id} (derivado de received/paginated)', async ({ magiisApi }) => {
		// El {id} (affiOSTravelId) no está en cfg → se deriva de un listado previo.
		const listRes = await magiisApi.getJson('affiOneShotTravel/received/paginated', { params: PAGE_PARAMS });
		test.skip(listRes.status() !== 200, 'received/paginated no disponible para derivar un affiOSTravelId');
		const page = await expectPageShape<{ affiOSTravelId?: number }>(listRes);
		test.skip(page.content.length === 0, 'Sin AffiOSTravel recibidos en el ambiente para derivar id');
		// getAffiliateOneShotTravel → AffiOSTravelToQuoteDTO.
		const r = await magiisApi.getJson(`affiOneShotTravel/${page.content[0].affiOSTravelId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'affiOSTravelId');
	});
});
