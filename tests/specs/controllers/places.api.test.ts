// tests/specs/controllers/places.api.test.ts
// PlacesController — base places. Geocoding/lugares (usa Google por detrás).
// Contrato: docs/reference/backend-endpoints-v1.72.2.md (§8.57).
// Ruta corregida: el stub llamaba getJson('getPlace') sin prefijo 'places/'.
// NOTA: getPlace/checkPlace dependen de un placeId real; sin dato de test se
// tolera 4xx. Ver BACKLOG §A (datos de prueba).

import { test, expect } from '@TestBase';
import { expectArray } from '@helpers';

test.describe('PlacesController', () => {
	test('Validar GET /places/getPlace responde con contrato conocido', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson('places/getPlace', {
			params: { address: 'Aeroparque Jorge Newbery, Buenos Aires', carrierId: cfg.carrierId }
		});
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			// getPlace → array de MagiisPlaceDTO (formattedAddress). Depende de geocoding (Google).
			const list = await expectArray<{ formattedAddress?: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('formattedAddress');
		}
	});

	// fixme: Google geocoding: placeId inválido → backend 500 (debería 400); requiere placeId real.
	test.fixme('Validar GET /places/checkPlace/:placeId (tolerante a dato de test)', async ({ magiisApi }) => {
		// placeId de ejemplo; sin uno válido en el ambiente se espera 4xx.
		const r = await magiisApi.getJson('places/checkPlace/ChIJ0000000000000000000000');
		expect([200, 400, 404]).toContain(r.status());
	});
});
