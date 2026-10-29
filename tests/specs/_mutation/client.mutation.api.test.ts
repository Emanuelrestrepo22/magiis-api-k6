// tests/specs/_mutation/client.mutation.api.test.ts
// Harness de mutación segura — ClientController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup.
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth → ClientController):
//   POST   carriers/{carrierId}/clients                     → CarrierResponseDTO (el carrier completo)
//   GET    carriers/{carrierId}/clients/{clientId}          → PassengerResponseDTO
//   DELETE carriers/{carrierId}/clients/{clientId}          (deleteClientCarrier)
//
// GAP DE CONTRATO (por eso este piloto exige seed real, no placeholders):
//   1. addClient NO crea un passenger: ENLAZA uno existente vía AddClientToCarrierRequestDTO.required = [passengerUserId]
//      (FK a un passenger real). Un placeholder numérico o QA-HARNESS no es plausible ni seguro.
//   2. El POST devuelve CarrierResponseDTO (el carrier completo, cuyo `id` es el id del carrier, NO un clientId).
//      => el create NO devuelve un clientId del recurso recién enlazado.
//   3. El recurso queda direccionable por un clientId propio (p.ej. el draft usa clients/3285, distinto de passengerUserId).
//   Sin poder derivar el clientId de la respuesta, un cleanup verificable exige conocerlo de antemano.
// Por eso el ciclo se habilita solo con seed explícito (ambos ids), y si falta → test.skip con motivo.
//   MAGIIS_SEED_PASSENGER_USER_ID → passengerUserId a enlazar (body del create).
//   MAGIIS_SEED_CLIENT_ID         → clientId resultante para verify/cleanup (GET/DELETE clients/{clientId}).

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';
const SEED_PASSENGER_USER_ID = process.env.MAGIIS_SEED_PASSENGER_USER_ID;
const SEED_CLIENT_ID = process.env.MAGIIS_SEED_CLIENT_ID;

test.describe.serial('[_mutation] ClientController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: enlazar cliente → verificar → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		// addClient devuelve CarrierResponseDTO (sin clientId) y requiere un passengerUserId real:
		// sin seed no hay FK plausible ni clientId verificable para el cleanup → se salta con motivo.
		test.skip(
			!SEED_PASSENGER_USER_ID || !SEED_CLIENT_ID,
			'ClientController: addClient enlaza un passenger existente (passengerUserId, FK real) y devuelve CarrierResponseDTO sin clientId. Setear MAGIIS_SEED_PASSENGER_USER_ID + MAGIIS_SEED_CLIENT_ID (solo TEST) para habilitar el ciclo.'
		);

		let clientId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const createRes = await magiisApi.postJson(`carriers/${cfg.carrierId}/clients`, {
				passengerUserId: Number(SEED_PASSENGER_USER_ID),
				isPaxVip: false
			});
			await expect2xx(createRes);
			// El POST devuelve CarrierResponseDTO (sin clientId del recurso): el recurso queda
			// direccionable por el clientId sembrado (ver GAP DE CONTRATO en el encabezado).
			clientId = Number(SEED_CLIENT_ID);

			// ── verify ──────────────────────────────────────────────────────────
			const getRes = await magiisApi.getJson(`carriers/${cfg.carrierId}/clients/${clientId}`);
			await expect2xx(getRes);
			const client = (await getRes.json()) as { passengerUserId?: number };
			expect(client).toHaveProperty('passengerUserId');
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (clientId !== null) {
				const del = await magiisApi.deleteJson(`carriers/${cfg.carrierId}/clients/${clientId}`);
				expect([200, 204, 404], 'cleanup DELETE tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
