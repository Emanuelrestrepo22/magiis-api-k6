// tests/specs/_mutation/magiis-access.mutation.api.test.ts
// Harness de mutación segura — MagiisAccessController (ver pilotos carrier-zone / carrier-service-types + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico a los pilotos):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth openapi.yaml → MagiisAccessController):
//   POST   magiisaccess/carrierprofile                                     → CarrierProfile { id, name, ... }  (body CarrierProfileRequestDTO)
//   GET    magiisaccess/carrierprofile/{id}                                → GetCarrierProfileDTO { id, name, ... }
//   DELETE magiisaccess/carrierprofile/{id}/deleteUserId/{deleteUserId}     → CarrierProfile
// Body create: CarrierProfileRequestDTO — sin campos required en el schema; se envían solo campos existentes
//   (name, description, carrierAccountId). carrierAccountId y deleteUserId salen de cfg.carrierId.
//   Nombre único con QA-HARNESS-${Date.now()}.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';

test.describe.serial('[_mutation] MagiisAccessController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear carrierProfile → verificar → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		let profileId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const profileName = `QA-HARNESS-${Date.now()}`;
			const createRes = await magiisApi.postJson('magiisaccess/carrierprofile', {
				name: profileName,
				description: 'QA harness mutation cycle',
				carrierAccountId: cfg.carrierId
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as { id?: number; name?: string };
			profileId = created.id ?? null;
			expect(profileId, 'createCarrierProfile debe devolver id').not.toBeNull();

			// ── verify ──────────────────────────────────────────────────────────
			const getRes = await magiisApi.getJson(`magiisaccess/carrierprofile/${profileId}`);
			await expect2xx(getRes);
			const profile = (await getRes.json()) as { id?: number; name?: string };
			expect(profile).toHaveProperty('id');
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (profileId !== null) {
				const del = await magiisApi.deleteJson(
					`magiisaccess/carrierprofile/${profileId}/deleteUserId/${cfg.carrierId}`
				);
				expect([200, 204, 404], 'cleanup DELETE tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
