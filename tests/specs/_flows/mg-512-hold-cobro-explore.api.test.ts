// tests/specs/_flows/mg-512-hold-cobro-explore.api.test.ts
// MG-512 (ATR "Hold & cobro") — EXPLORATORIO API en TEST. Áreas ATP: E (hold · MG-158),
// F (cobro/finalize · MG-161), COB (cobro a bordo).
//
// KATA Nivel 2: delega en el componente `paymentApi` (L3, tests/components/api/PaymentApi.ts).
// Cada ATC lleva su @atc('MG-XXXX') (trazabilidad declarativa) + fixed assertion tolerante.
// Los POST se prueban con BODY VACÍO → NO cobran (el backend rechaza sin payload válido);
// el spec loguea el status real ([EXPLORE]) para el reporte de hallazgos.
//
// Sacar de exploratorio a aserción firme requiere: deploy MG-3 en TEST + regen contrato +
// fixture 3DS sembrado. GUARDAS: sin creds → skip; probes SOLO TEST + NUNCA PROD; epayment
// además bajo ALLOW_MUTATIONS por su riesgo de cobro real.

import { test } from '@TestBase';

const HAS_CREDS = Boolean(process.env.LOGIN_USER && process.env.LOGIN_PASSWORD);
const IS_PROD = (process.env.ENV ?? 'uat') === 'prod';
const IS_TEST = (process.env.ENV ?? 'uat') === 'test';
const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';

// ── Precondiciones read (ejecutables hoy) ─────────────────────────────────────────────────
test.describe('MG-512 — Hold & cobro · precondiciones (read)', () => {
	test.skip(!HAS_CREDS, 'Faltan credenciales: LOGIN_USER + LOGIN_PASSWORD en .env.<env>.');

	test('MG-512-CONNACCT · connectedAccount → cuenta conectada', async ({ paymentApi, cfg }) => {
		const r = await paymentApi.getConnectedAccount(cfg.carrierId);
		console.log(`[EXPLORE][MG-512] connectedAccount → ${r.status()}`);
	});

	test('MG-512-ALLCARDS · allCards → wallet (precond cobro)', async ({ paymentApi, cfg }) => {
		const passengerId = await paymentApi.resolveFirstPassengerId(cfg.carrierId);
		test.skip(passengerId === undefined, 'Sin clientes en el carrier para derivar {passengerId}.');
		const r = await paymentApi.getAllCards(passengerId!);
		console.log(`[EXPLORE][MG-512] allCards → ${r.status()}`);
	});
});

// ── Probes exploratorios de endpoints MG-3 (body vacío → no cobran) ──────────────────────────
test.describe.serial('MG-512 — probes hold/cobro (exploratorio · solo TEST)', () => {
	test.skip(!HAS_CREDS, 'Faltan credenciales.');
	test.skip(IS_PROD, 'Pagos PROHIBIDOS contra PROD.');
	test.skip(!IS_TEST, 'Exploratorio de pago SOLO en TEST (UAT/PROD usan tarjetas reales → PSP bloquea la cuenta).');

	test('MG-512-HOLD3DS-PROBE · confirmHoldWith3DS (body vacío) → status real', async ({ paymentApi, cfg }) => {
		const travelId = (await paymentApi.resolveFirstTravelId(cfg.carrierId)) ?? 0;
		const r = await paymentApi.probeHoldWith3DS(cfg.carrierId, travelId);
		console.log(`[EXPLORE][MG-512] confirmHoldWith3DS (travelId=${travelId}) → ${r.status()}`);
	});

	test('MG-512-CARDVAL3DS-PROBE · cardValidationWith3DS (body vacío) → status real', async ({ paymentApi, cfg }) => {
		const passengerId = await paymentApi.resolveFirstPassengerId(cfg.carrierId);
		test.skip(passengerId === undefined, 'Sin {passengerId}.');
		const r = await paymentApi.probeCardValidationWith3DS(cfg.carrierId, passengerId!);
		console.log(`[EXPLORE][MG-512] cardValidationWith3DS → ${r.status()}`);
	});

	test('MG-512-EPAYMENT-PROBE · epayment (body vacío) → status real', async ({ paymentApi }) => {
		test.skip(!ALLOW_MUTATIONS, 'epayment probe bajo ALLOW_MUTATIONS=1 (cauto por riesgo de cobro).');
		const r = await paymentApi.probeEpayment();
		console.log(`[EXPLORE][MG-512] epayment → ${r.status()}`);
	});
});
