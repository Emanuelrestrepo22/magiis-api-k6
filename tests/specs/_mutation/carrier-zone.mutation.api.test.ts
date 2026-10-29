// tests/specs/_mutation/carrier-zone.mutation.api.test.ts
// PILOTO del harness de mutación segura (ver docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup sobre CarrierZoneController (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD:
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth):
//   POST   carriers/{carrierId}/carrierZone                       → { idZone, idForCarrier }
//   GET    carriers/{carrierId}/carrierZone/{zoneId}
//   DELETE carriers/{carrierId}/carrierZone/delete/{idForCarrier}

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';

test.describe.serial('[_mutation] CarrierZoneController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear zona → verificar → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		let idForCarrier: number | null = null;
		let zoneId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const zoneName = `QA-HARNESS-${Date.now()}`;
			// zoneDetailsList NO puede ir vacío: CarrierZoneService.createCarrierZone lanza
			// "Zone details cannot be null or empty" (else, líneas 146-147) → el controller lo
			// mapea a ZONE_CONFLICT 409 (createZone catch, línea 54). Con newAreaList/importedList
			// vacíos, validCarrierAreaDTO queda null y NO corre validación de solapamiento de
			// horarios, así que basta un OpeDaysTimeDTO válido (day/hourFrom/hourTo @NotNull).
			const createRes = await magiisApi.postJson(`carriers/${cfg.carrierId}/carrierZone`, {
				name: zoneName,
				colorId: '1',
				rateTable: '',
				zoneGroup: 0,
				importedList: [],
				newAreaList: [],
				zoneDetailsList: [{ day: '1', hourFrom: '00:00', hourTo: '23:59' }]
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as { idZone?: number; idForCarrier?: number };
			zoneId = created.idZone ?? null;
			idForCarrier = created.idForCarrier ?? null;
			expect(idForCarrier, 'createZone debe devolver idForCarrier').not.toBeNull();

			// ── verify ──────────────────────────────────────────────────────────
			test.skip(zoneId === null, 'createZone no devolvió idZone para verificar');
			const getRes = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierZone/${zoneId}`);
			await expect2xx(getRes);
			const zone = (await getRes.json()) as { name?: string };
			expect(zone).toHaveProperty('name');
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (idForCarrier !== null) {
				const del = await magiisApi.deleteJson(`carriers/${cfg.carrierId}/carrierZone/delete/${idForCarrier}`);
				expect([200, 204, 404], 'cleanup DELETE tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
