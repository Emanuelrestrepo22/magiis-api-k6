// tests/specs/_flows/mg-3-stripe-direct-charge.api.test.ts
// MG-3 — [Stripe][BE] Quitar marketplace de Stripe (cobro DIRECTO sobre la cuenta
// conectada del carrier + webhook async + 3DS/SCA). OLA 1 de cobertura API.
//
// TRAZABILIDAD: makeAnnotate('MG-3') → tms=MG-3 + tc=MG-3-<TC> (contrato canónico del
// portafolio, consumido por el xray-reporter). Sustituye la convención TS-API-TC### (ver
// tests/helpers/traceability.ts).
//
// RUTAS (exactas del ticket MG-3 — NO se inventan otras):
//   GET  vendor/carrier/{carrierId}/connectedAccount                         → cuenta conectada del carrier
//   GET  passengers/{passengerId}/allCards                                   → regresión: SIN wallet ⇒ 200, NO 500
//   POST cards/passengers/{passengerId}/cardValidationWith3DS/{carrierId}    → requires_action ⇒ TC NO validada (3DS)
//   POST cards/passengers/{passengerId}/{carrierId}/confirm3DSVerification    → release tras 3DS
//   POST carriers/{carrierId}/travels/{travelId}/confirmHoldWith3DS          → hold: REQUIRES_ACTION→NO_AUTH; 3DS OK→HOLD
//   POST epayment (finalize)                                                 → cobro por webhook async (sleep 2s ×3)
//
// GAP DE CONTRATO (BLOQUEO principal de la OLA):
//   El catálogo/OpenAPI del repo son de release/v1.72.1 y PREDATAN MG-3. Sólo `allCards`
//   existe hoy en scripts/backend-route-catalog.json. `connectedAccount`, `cardValidationWith3DS`,
//   `confirm3DSVerification`, `confirmHoldWith3DS` y el `epayment` finalize NO están en el
//   catálogo, DTOs ni openapi.yaml → shapes NO confirmables desde el repo. Por eso:
//     - `allCards` (existe) → aserción confiable.
//     - `connectedAccount` (GET read-only) → aserción CONSERVADORA (status + body truthy) + TODO shape.
//     - los POST 3DS/hold/epayment (mutantes + body/estado no confirmados) → test.fixme con motivo.
//   TODO(MG-3): confirmar rutas/shapes contra dev u OpenAPI regenerado antes de quitar fixme.
//
// GUARDAS:
//   - Sin creds (LOGIN_USER/LOGIN_PASSWORD) → skip (el cliente haría throw en login).
//   - Bloques mutantes: doble guarda ALLOW_MUTATIONS=1 + NUNCA PROD (idéntico al harness de mutación).

import { test, expect } from '@TestBase';
import { readJsonSafe, makeAnnotate } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

// Trazabilidad canónica del portafolio — tms=MG-3, tc=MG-3-<TC>.
const annotate = makeAnnotate('MG-3');

const HAS_CREDS = Boolean(process.env.LOGIN_USER && process.env.LOGIN_PASSWORD);
const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'uat') === 'prod';
// CANÓNICO: los flujos de pago corren SOLO en TEST. UAT usa tarjetas reales → la actividad
// de pruebas es inusual y los PSP (Stripe/etc.) BLOQUEAN la cuenta. TEST usa tarjetas de prueba.
const IS_TEST = (process.env.ENV ?? 'uat') === 'test';

// {passengerId} candidato: passengerUserId del primer cliente del carrier de runtime
// (usado por el bloque mutante fixme; los tests activos derivan vía paymentApi).
async function firstPassengerId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`carriers/${carrierId}/clients`);
	if (src.status() !== 200) return undefined;
	const list = await readJsonSafe<Array<{ passengerUserId?: number }>>(src);
	return Array.isArray(list) ? list[0]?.passengerUserId : undefined;
}

test.describe('MG-3 — Stripe cobro directo (OLA 1)', () => {
	test.skip(!HAS_CREDS, 'Faltan credenciales: setear LOGIN_USER + LOGIN_PASSWORD en .env.<env>.');

	// ── TC-MG3-REG-ALLCARDS · regresión (CONFIABLE — endpoint existe en v1.72.1) ──────────
	// MG-3: un passenger SIN wallet debe devolver 200 (vacío), NO 500. La aserción load-bearing
	// es "status ≠ 500" sobre cualquier passenger derivado (el bug era 500 al no haber wallet).
	test('TC-MG3-REG-ALLCARDS · GET passengers/{passengerId}/allCards → 200/vacío, nunca 500', async ({
		paymentApi,
		cfg
	}) => {
		annotate('REG-ALLCARDS');
		const passengerId = await paymentApi.resolveFirstPassengerId(cfg.carrierId);
		test.skip(passengerId === undefined, 'Sin clientes en el carrier para derivar {passengerId}.');

		// KATA: el ATC paymentApi.getAllCards ya asevera ≠5xx + tolerante (regresión MG-3).
		const r = await paymentApi.getAllCards(passengerId!);
		if (r.status() === 200) {
			// 200 puede venir con cuerpo vacío (sin cards) → readJsonSafe evita "Unexpected end of JSON input".
			const list = await readJsonSafe<Array<{ cardId?: string; id?: number }>>(r);
			if (list !== null) expect(Array.isArray(list), 'allCards 200 debe ser un array (posiblemente vacío)').toBe(true);
		}
	});

	// ── TC-MG3-CONNACCT · cuenta conectada (CONSERVADOR — ruta nueva, GET read-only) ──────
	// Habilita el cobro directo. Shape NO confirmable desde el repo (no está en openapi.yaml):
	// se asevera status tolerante (≠5xx) y, si 200, presencia de cuerpo. 404 se tolera por si el
	// endpoint aún no está desplegado en el ambiente.
	test('TC-MG3-CONNACCT · GET vendor/carrier/{carrierId}/connectedAccount → 200 + body', async ({
		paymentApi,
		cfg
	}) => {
		annotate('CONNACCT');
		// KATA: el ATC paymentApi.getConnectedAccount ya asevera ≠5xx + tolerante.
		const r = await paymentApi.getConnectedAccount(cfg.carrierId);
		if (r.status() === 200) {
			const body = await readJsonSafe<Record<string, unknown>>(r);
			expect(body, 'connectedAccount 200 debe traer cuerpo').toBeTruthy();
			// TODO(MG-3): confirmar shape con dev/OpenAPI regen — validar presencia del id de la
			// cuenta conectada (p.ej. `id` | `accountId` | `connectedAccountId` | `stripeAccountId`).
		}
	});
});

// ── Bloque MUTANTE: 3DS / hold / epayment (doble guarda + fixme por shape/estado no confirmado) ──
// Todos disparan flujos de pago reales (mutan estado / cobran). Rutas nuevas de MG-3 con body y
// máquina de estados NO confirmables desde el repo → estructurados pero en test.fixme.
test.describe.serial('MG-3 — 3DS/hold/epayment (mutante · OLA 2)', () => {
	test.skip(IS_PROD, 'Flujos de pago PROHIBIDOS contra PROD.');
	test.skip(
		!IS_TEST,
		'Flujos de pago SOLO en TEST: UAT usa tarjetas reales → los PSP bloquean la cuenta. Setear ENV=test.'
	);
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 (solo TEST) + luz verde del QA Lead.');

	// ── TC-MG3-3DSVAL · validación de tarjeta con 3DS ──────────────────────────────────────
	// Si Stripe responde requires_action → la TC queda NO validada (dispara 3DS).
	test('TC-MG3-3DSVAL · POST cardValidationWith3DS → requires_action ⇒ TC no validada', async ({ magiisApi, cfg }) => {
		annotate('3DSVAL');
		test.fixme(
			true,
			'MG-3 ruta nueva (no en openapi.yaml). Requiere body de validación (token/paymentMethod de tarjeta 3DS) confirmado con PO/dev. Al confirmar: assert requires_action ⇒ tarjeta NO validada.'
		);
		const passengerId = await firstPassengerId(magiisApi, cfg.carrierId);
		const r = await magiisApi.postJson(`cards/passengers/${passengerId}/cardValidationWith3DS/${cfg.carrierId}`, {
			// TODO(MG-3): body real de validación con 3DS (confirmar con dev/OpenAPI regen).
		});
		expect([200, 202, 400, 402, 404]).toContain(r.status());
		// TODO(MG-3): si el cuerpo indica requires_action → la TC debe quedar NO validada.
	});

	// ── TC-MG3-3DSCONFIRM · release tras 3DS ────────────────────────────────────────────────
	test('TC-MG3-3DSCONFIRM · POST confirm3DSVerification → release post-3DS', async ({ magiisApi, cfg }) => {
		annotate('3DSCONFIRM');
		test.fixme(
			true,
			'MG-3 ruta nueva. Depende de un paymentIntent en requires_action del paso TC-MG3-3DSVAL + confirmación interactiva de 3DS (no automatizable sin fixture Stripe). Body/shape a confirmar con dev.'
		);
		const passengerId = await firstPassengerId(magiisApi, cfg.carrierId);
		const r = await magiisApi.postJson(`cards/passengers/${passengerId}/${cfg.carrierId}/confirm3DSVerification`, {
			// TODO(MG-3): body real del confirm (paymentIntentId / verification data).
		});
		expect([200, 202, 400, 404]).toContain(r.status());
	});

	// ── TC-MG3-HOLD3DS · hold con 3DS ───────────────────────────────────────────────────────
	// REQUIRES_ACTION → viaje NO_AUTH; tras 3DS OK → cardHold=HOLD + buscando chofer.
	test('TC-MG3-HOLD3DS · POST confirmHoldWith3DS → REQUIRES_ACTION|HOLD', async ({ magiisApi, cfg }) => {
		annotate('HOLD3DS');
		test.fixme(
			true,
			'MG-3 ruta nueva. Requiere un {travelId} en estado apto para hold + fixture 3DS. Al confirmar: REQUIRES_ACTION ⇒ viaje NO_AUTH; 3DS OK ⇒ cardHold=HOLD + buscando chofer. travelId/body a confirmar con dev.'
		);
		const travelId = 0; // TODO(MG-3): derivar/sembrar un travelId apto para hold.
		const r = await magiisApi.postJson(`carriers/${cfg.carrierId}/travels/${travelId}/confirmHoldWith3DS`, {
			// TODO(MG-3): body real del hold con 3DS.
		});
		expect([200, 202, 400, 404]).toContain(r.status());
	});

	// ── TC-MG3-18 · epayment finalize + webhook async (RIESGO CRÍTICO: no doble cobro) ──────
	// El cobro llega por webhook async → poll (sleep 2s × 3 reintentos). Estados API Pública
	// (MGWTransactionStatus): PENDING, REQUIRES_ACTION. Idempotencia: reenviar el finalize NO
	// debe generar un segundo cobro.
	test('TC-MG3-18 · POST epayment finalize → idempotencia / no doble cobro (webhook async)', async ({ magiisApi }) => {
		annotate('18');
		test.fixme(
			true,
			'RIESGO CRÍTICO MG-3. Requiere: (1) ruta/body exactos del epayment finalize (no en openapi.yaml), (2) un travel/payment sembrado y cobrable, (3) verificar no-doble-cobro tras webhook async. Sin datos confirmados no se puede aseverar sin riesgo de cobro real. Estructura de referencia abajo.'
		);
		// Estructura de referencia (a cablear cuando ruta/datos estén confirmados):
		//   1. finalize #1 → esperar estado inicial (PENDING | REQUIRES_ACTION).
		//   2. poll webhook: hasta 3 intentos, sleep 2s entre cada uno, hasta transición del estado.
		//   3. finalize #2 (reintento idempotente) → NO debe generar un segundo cargo.
		//   4. assert: exactamente 1 transacción cobrada para el mismo idempotency-key/travel.
		const r = await magiisApi.postJson('epayment', {
			// TODO(MG-3): body real del finalize (confirmar ruta y payload con dev/OpenAPI regen).
		});
		expect([200, 202, 400, 402, 404]).toContain(r.status());
	});
});
