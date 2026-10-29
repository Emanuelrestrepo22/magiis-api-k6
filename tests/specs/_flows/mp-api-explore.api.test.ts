// tests/specs/_flows/mp-api-explore.api.test.ts
// Mercado Pago — EXPLORATORIO API en TEST. TCs MP-only del ATP:
//   MPX-01 (MG-194): cobro directo cuenta conectada MP + geo-gating (AR/CO/PE), sin marketplace.
//   MPX-02 (MG-195): las tarjetas del pax viven en la cuenta MercadoPago (customer/cards), NO local.
//
// KATA Nivel 2: delega en el componente `paymentApi` (L3). Cada ATC lleva su @atc (MG-194/195/3).
// Cobertura API MP EXPLORATORIA READ-ONLY (la regresión cross-gateway MP se hace por UI en
// magiis-playwright). Mutaciones MP (link/charge) fuera de alcance; cobro E2E MP = UAT-only
// (sandbox no transacciona en TEST — validado por UI).
//
// GUARDAS: sin creds → skip. Read-only → no requiere ALLOW_MUTATIONS.

import { test } from '@TestBase';

const HAS_CREDS = Boolean(process.env.LOGIN_USER && process.env.LOGIN_PASSWORD);

test.describe('MP API — exploratorio read (TEST)', () => {
	test.skip(!HAS_CREDS, 'Faltan credenciales: LOGIN_USER + LOGIN_PASSWORD en .env.<env>.');

	// MPX-02 (MG-195) — tarjetas del pax en la cuenta MP. Gap total previo en el repo.
	test('MPX-02-PAYMENTMETHODS · paymentMethodsByPax → métodos del pax (cuenta MP)', async ({ paymentApi, cfg }) => {
		const passengerId = await paymentApi.resolveFirstPassengerId(cfg.carrierId);
		const r = await paymentApi.probePaymentMethodsByPax(cfg.carrierId, passengerId);
		console.log(`[EXPLORE][MP] paymentMethodsByPax (passengerId=${passengerId ?? 'n/a'}) → ${r.status()}`);
	});

	// MPX-01 (MG-194) — tipos de tarjeta soportados por el carrier (read).
	test('MPX-01-CARDTYPES · cardTypes → tipos soportados', async ({ paymentApi, cfg }) => {
		const r = await paymentApi.getCardTypes(cfg.carrierId);
		console.log(`[EXPLORE][MP] cardTypes → ${r.status()}`);
	});

	// Cuenta conectada del carrier (pre-cobro directo, ancla MG-3).
	test('MP-CONNACCT · connectedAccount → cuenta conectada', async ({ paymentApi, cfg }) => {
		const r = await paymentApi.getConnectedAccount(cfg.carrierId);
		console.log(`[EXPLORE][MP] connectedAccount → ${r.status()}`);
	});
});
