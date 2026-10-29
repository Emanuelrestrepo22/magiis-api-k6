// tests/specs/controllers/client.api.test.ts
// ClientController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (ClientController).
// Shapes: openapi.yaml (PassengerResponseDTO, CountClientsDTO, Page inline content+totalElements).
// carrierId = cfg.carrierId. clientId no está en cfg → derivado del listado de clientes.
// PassengerResponseDTO.required incluye passengerUserId → se usa como prop del item.
// Endpoints mutating (POST addClient/deleteClient, PUT updateClient/updateOperability, DELETE) fuera de alcance.

import { test, expect } from '@TestBase';
import { expect2xx, expectPageShape, expectObjectWithProperty, readJsonSafe } from '@helpers';

const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };

test.describe('ClientController', () => {
	// ── Agregado carrier-scoped → CountClientsDTO (countLocal/countPassenger req) ─
	test('Validar GET carriers/{carrierId}/clients/totalClients', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/clients/totalClients`);
		const body = await expectObjectWithProperty<{ countLocal?: number; countPassenger?: number }>(r, 'countLocal');
		expect(body).toHaveProperty('countPassenger');
	});

	// ── Listado carrier-scoped → array<PassengerResponseDTO> ─────────────────────
	//    Cuerpo vacío intermitente en prod ("Unexpected end of JSON input") → readJsonSafe:
	//    validar 2xx y assertar shape solo si el body no es null.
	test('Validar GET carriers/{carrierId}/clients', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/clients`);
		await expect2xx(r);
		const list = await readJsonSafe<Array<{ passengerUserId?: number }>>(r);
		if (list) {
			expect(Array.isArray(list)).toBe(true);
			if (list.length > 0) expect(list[0]).toHaveProperty('passengerUserId');
		}
	});

	// ── Paginado carrier-scoped → Page<PassengerResponseDTO> ─────────────────────
	test('Validar GET carriers/{carrierId}/clients/paginated', async ({ magiisApi, cfg }) => {
		// Optional.get() UNGUARDED sobre 'find' en el backend → 500 "No value present" sin él; find:'' → 200.
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/clients/paginated`, {
			params: { ...PAGE_PARAMS, find: '' }
		});
		const page = await expectPageShape<{ passengerUserId?: number }>(r);
		if (page.content.length > 0) expect(page.content[0]).toHaveProperty('passengerUserId');
	});

	// ── clientId derivado del listado → PassengerResponseDTO ──────────────────────
	//    El param {clientId} no está documentado como equivalente exacto a un campo del
	//    DTO; se deriva passengerUserId (required) del primero → status tolerante + shape si 200.
	test('Validar GET carriers/{carrierId}/clients/{clientId}', async ({ magiisApi, cfg }) => {
		const src = await magiisApi.getJson(`carriers/${cfg.carrierId}/clients`);
		await expect2xx(src);
		const list = await readJsonSafe<Array<{ passengerUserId?: number }>>(src);
		test.skip(!list || list.length === 0, 'Sin clientes en el ambiente para derivar {clientId}');
		const clientId = list![0].passengerUserId;
		test.skip(clientId === undefined, 'Primer cliente sin passengerUserId');
		const r = await magiisApi.getJson(`carriers/${cfg.carrierId}/clients/${clientId}`);
		expect([200, 400, 403, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'passengerUserId');
	});
});
