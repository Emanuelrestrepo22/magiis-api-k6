// tests/specs/_mutation/special-rate-trigger.mutation.api.test.ts
// Harness de mutación segura — SpecialRateTriggerController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth → SpecialRateTriggerController):
//   GET    carriers/rate/{carrierId}                                   → List<CarrierRateResponseDTO> (deriva carrierRateId FK)
//   POST   carriers/{carrierId}/specialRateTrigger/create             → Long (specialRateId real, no count)
//   GET    carriers/{carrierId}/specialRateTrigger/{specialRateId}     → SpecialRateTriggerResponseDTO { specialRateId, ... }
//   POST   carriers/{carrierId}/specialRateTrigger/{specialRateId}/delete  (body SpecialRateTriggerUpdateRequestDTO)
//
// GROUND-TRUTH del fallo observado (CREATE 200 devuelve Long, pero VERIFY GET → 500):
//   SpecialRateTriggerService.createSpecialRateTrigger (L79-120) reserva specialRateId vía secuencia y SÓLO
//   persiste filas si daysSchedule O periodSchedule vienen NO vacíos (L82/L100); si ambos faltan, no guarda
//   NADA pero igual devuelve el id (L119). El id devuelto SÍ es el specialRateId correcto para el GET.
//   El GET-by-id → getSpecialRateTriggerResponseDTO (L222-234): hace specialRateList.get(0) sobre lista vacía
//   → IndexOutOfBoundsException (no es HttpException, no la atrapa el catch) → HTTP 500. Además resuelve el FK
//   con carrierRateService.findById(carrierRateId).get() → NoSuchElementException/500 si carrierRateId no existe.
//   FIX: enviar ≥1 schedule + un carrierRateId REAL derivado del carrier para que la fila persista y el GET resuelva.
// Bodies (openapi.yaml components.schemas):
//   - SpecialRateTriggerRequestDTO       → ruleName + carrierRateId (FK real) + daysSchedule[≥1] (mínimo para persistir + verificar).
//   - SpecialRateTriggerUpdateRequestDTO → sin campos required; body mínimo para el delete (soft-delete idempotente).

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';

test.describe.serial('[_mutation] SpecialRateTriggerController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear special rate trigger → verificar → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		let specialRateId: number | null = null;

		try {
			// ── precondición: derivar carrierRateId FK real (read-only) ─────────
			// El create @NotNull carrierRateId (entity SpecialRateTrigger L62-64) y el GET-by-id resuelve
			// carrierRateService.findById(carrierRateId).get(); sin un FK válido el VERIFY revienta en 500.
			const ratesRes = await magiisApi.getJson(`carriers/rate/${cfg.carrierId}`);
			await expect2xx(ratesRes);
			const rates = (await ratesRes.json()) as Array<{ id?: number }>;
			expect(
				Array.isArray(rates) && rates.length > 0,
				'precondición: el carrier debe tener ≥1 carrierRate para asociar al trigger'
			).toBe(true);
			const carrierRateId = rates[0]?.id;
			expect(carrierRateId, 'carrierRateId derivado no debe ser null/undefined').toBeTruthy();

			// ── create ──────────────────────────────────────────────────────────
			// Se envía daysSchedule con 1 entrada + carrierRateId para que el service PERSISTA la fila
			// (sin schedule no guarda nada y el GET-by-id devuelve 500). Valores neutros e inertes.
			const ruleName = `QA-HARNESS-${Date.now()}`;
			const createRes = await magiisApi.postJson(`carriers/${cfg.carrierId}/specialRateTrigger/create`, {
				ruleName,
				carrierRateId,
				daysSchedule: [{ day: '1', hourFrom: '00:00', hourTo: '01:00' }],
				enabled: false
			});
			await expect2xx(createRes);
			// La ruta devuelve un Long crudo (no objeto): el id es el propio JSON number (el specialRateId real).
			const created = (await createRes.json()) as number;
			specialRateId = typeof created === 'number' && Number.isFinite(created) ? created : null;
			expect(specialRateId, 'addSpecialRateTrigger debe devolver un id (Long)').not.toBeNull();

			// ── verify ──────────────────────────────────────────────────────────
			const getRes = await magiisApi.getJson(`carriers/${cfg.carrierId}/specialRateTrigger/${specialRateId}`);
			await expect2xx(getRes);
			const rate = (await getRes.json()) as { specialRateId?: number };
			expect(rate).toHaveProperty('specialRateId');
			expect(rate.specialRateId, 'el GET debe devolver el mismo specialRateId creado').toBe(specialRateId);
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (specialRateId !== null) {
				const del = await magiisApi.postJson(`carriers/${cfg.carrierId}/specialRateTrigger/${specialRateId}/delete`, {
					enabled: false
				});
				expect([200, 204, 404], 'cleanup delete tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
