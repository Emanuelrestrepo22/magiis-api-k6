// tests/specs/controllers/card.api.test.ts
// CardController — cobertura READ-ONLY (solo GET). Dominio de medios de pago (Stripe/MercadoPago).
// Rutas exactas: scripts/backend-route-catalog.json (CardController).
// Shapes: openapi.yaml (CardDTO req cardId/id; CardTypeDTO req id/name; AppPagoDTO sin required).
// {carrierId} = cfg.carrierId. {passengerId}/{userId} candidatos = passengerUserId del primer cliente
// del carrier (PassengerResponseDTO). {appId} candidato = primer mercadopagoAppId de las relaciones
// contractor del carrier (CarrierContractorRelationDTO). Integración de pagos externa + datos
// passenger-scoped desde token carrier → aserciones tolerantes (incl. 403; el set descarta 5xx).
// Endpoints mutantes (POST addCard*/validateCard*, PUT setDefaultCard, DELETE deleteCard) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, readJsonSafe } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

// Paginados: el backend hace Optional.get() sobre page/size/column/sort → 500 si van vacíos. Siempre enviarlos.
const PAGE_PARAMS = { page: 1, size: 10, column: 'id', sort: 'ASC' };
const TOLERANT = [200, 400, 403, 404];

// passengerId/userId candidato: passengerUserId del primer cliente del carrier de runtime.
async function firstPassengerId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carriers/${carrierId}/clients`);
	if (src.status() !== 200) return undefined;
	const list = await readJsonSafe<Array<{ passengerUserId?: number }>>(src);
	return Array.isArray(list) ? list[0]?.passengerUserId : undefined;
}

// appId candidato: primer mercadopagoAppId presente en las relaciones contractor del carrier.
// find:'' — backend hace Optional.get() UNGUARDED sobre 'find' → 500 "No value present" sin él.
async function firstAppId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carrier/${carrierId}/contractors/paginated`, {
		params: { ...PAGE_PARAMS, find: '' }
	});
	if (src.status() !== 200) return undefined;
	const body = await readJsonSafe<{ content?: Array<{ mercadopagoAppId?: number }> }>(src);
	return body?.content?.find((rel) => typeof rel.mercadopagoAppId === 'number')?.mercadopagoAppId;
}

test.describe('CardController', () => {
	// ── carrierId = cfg.carrierId → array<CardTypeDTO> (id/name req). Dominio pago → tolerante ──
	test('Validar GET cards/{carrierId}/cardTypes', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`cards/${cfg.carrierId}/cardTypes`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: string; name?: string }>(r);
			if (list.length > 0) {
				expect(list[0]).toHaveProperty('id');
				expect(list[0]).toHaveProperty('name');
			}
		}
	});

	// ── passengerId derivado → array<CardDTO> (cardId/id req) ──
	test('Validar GET passengers/{passengerId}/allCards', async ({ magiisApi, cfg }) => {
		const passengerId = await firstPassengerId(magiisApi, cfg.carrierId);
		test.skip(passengerId === undefined, 'Sin clientes en el carrier para derivar {passengerId}');
		const r = await magiisApi.getJson(`passengers/${passengerId}/allCards`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			// 200 puede venir con cuerpo vacío (sin cards) → readJsonSafe evita "Unexpected end of JSON input".
			const list = await readJsonSafe<Array<{ cardId?: string; id?: number }>>(r);
			if (list && list.length > 0) expect(list[0]).toHaveProperty('cardId');
		}
	});

	// ── passengerId derivado → array<AppPagoDTO> (sin required → item truthy) ──
	test('Validar GET passengers/{passengerId}/countryWithoutWallets', async ({ magiisApi, cfg }) => {
		const passengerId = await firstPassengerId(magiisApi, cfg.carrierId);
		test.skip(passengerId === undefined, 'Sin clientes en el carrier para derivar {passengerId}');
		const r = await magiisApi.getJson(`passengers/${passengerId}/countryWithoutWallets`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			// 200 puede venir con cuerpo vacío → readJsonSafe evita crash de parseo.
			const list = await readJsonSafe<Array<Record<string, unknown>>>(r);
			if (list && list.length > 0) expect(list[0]).toBeTruthy();
		}
	});

	// ── passengerId + appId derivados → array<CardDTO> ──
	test('Validar GET passengers/{passengerId}/cards/app/{appId}', async ({ magiisApi, cfg }) => {
		const passengerId = await firstPassengerId(magiisApi, cfg.carrierId);
		test.skip(passengerId === undefined, 'Sin clientes en el carrier para derivar {passengerId}');
		const appId = await firstAppId(magiisApi, cfg.carrierId);
		test.skip(appId === undefined, 'Sin mercadopagoAppId en las relaciones del carrier para derivar {appId}');
		const r = await magiisApi.getJson(`passengers/${passengerId}/cards/app/${appId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			// 200 puede venir con cuerpo vacío → readJsonSafe evita crash de parseo.
			const list = await readJsonSafe<Array<{ cardId?: string }>>(r);
			if (list && list.length > 0) expect(list[0]).toHaveProperty('cardId');
		}
	});

	// ── userId + appId derivados → array<CardDTO> (getAllByUser, deprecated) ──
	test('Validar GET users/{userId}/cards/app/{appId}', async ({ magiisApi, cfg }) => {
		const userId = await firstPassengerId(magiisApi, cfg.carrierId);
		test.skip(userId === undefined, 'Sin clientes en el carrier para derivar {userId}');
		const appId = await firstAppId(magiisApi, cfg.carrierId);
		test.skip(appId === undefined, 'Sin mercadopagoAppId en las relaciones del carrier para derivar {appId}');
		const r = await magiisApi.getJson(`users/${userId}/cards/app/${appId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			// 200 puede venir con cuerpo vacío → readJsonSafe evita crash de parseo.
			const list = await readJsonSafe<Array<{ cardId?: string }>>(r);
			if (list && list.length > 0) expect(list[0]).toHaveProperty('cardId');
		}
	});
});
