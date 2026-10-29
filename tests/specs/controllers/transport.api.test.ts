// tests/specs/controllers/transport.api.test.ts
// TransportController — base transportTypes. Catálogo global de tipos de transporte.
// Rutas corregidas contra docs/reference/backend-endpoints-v1.72.2.md (§8.42).
// El stub auto-generado tenía rutas rotas (getJson('clusters')) por snapshot corrupto.

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expect2xx } from '@helpers';

test.describe('TransportController', () => {
	test('Validar GET /transportTypes retorna lista de tipos de transporte', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('transportTypes', { params: { search: '' } });
		const list = await expectArray<{ id: number; name: string }>(r);
		if (list.length > 0) {
			expect(list[0]).toHaveProperty('id');
			expect(list[0]).toHaveProperty('name');
		}
	});

	test('Validar GET /transportTypes/clusters retorna clusters', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('transportTypes/clusters');
		const list = await expectArray<{ id: number; code: string; description: string }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('code');
	});

	test('Validar GET /transportTypes/paginated tiene shape Page<T>', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('transportTypes/paginated', {
			params: { page: 1, size: 10, column: 'id', sort: 'ASC', find: '' }
		});
		await expectPageShape(r);
	});

	test('Validar GET /transportTypes/:id (derivado de la lista)', async ({ magiisApi }) => {
		const listRes = await magiisApi.getJson('transportTypes', { params: { search: '' } });
		const list = await expectArray<{ id: number }>(listRes);
		test.skip(list.length === 0, 'Sin transportTypes en el ambiente para derivar un id');
		const r = await magiisApi.getJson(`transportTypes/${list[0].id}`);
		await expect2xx(r);
		const body = (await r.json()) as { id?: number };
		expect(body.id).toBe(list[0].id);
	});
});
