// tests/specs/_mutation/contractor-user.mutation.api.test.ts
// Harness de mutación segura — ContractorUserController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup.
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// GUARD EXTRA: el contractor id NO vive en cfg (cfg = carrierId/driverId). Se lee de
//   MAGIIS_TEST_CONTRACTOR_ID; si falta, el test se salta (no se inventa un id).
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth backend-route-catalog.json → ContractorUserController):
//   POST   contractors/{id}/users                → AbleToUseContractorUserResponseDTO   (body AbleToUseContractorUserRequestDTO)
//   GET    contractors/{id}/users/{userId}       → UserResponseDTO (userId req)
//   POST   contractors/delete/{userId}           (deleteUser, idempotente)
// Body create: AbleToUseContractorUserRequestDTO — required: email, firstName, lastName, phone.
//
// GAP DE CONTRATO (por eso el userId se extrae con cuidado y el cleanup es defensivo):
//   createUser devuelve AbleToUseContractorUserResponseDTO, que representa al CONTRACTOR
//   (companyName/tributeNumber…; su `id` es el contractorId, NO el del usuario recién creado).
//   El id del usuario creado se lee de `employeeUserId` (única candidata plausible del DTO para
//   direccionar {userId} en GET/DELETE). Si el backend no lo devuelve → verify y cleanup se saltan
//   y NO se borra nada (se evita un POST delete/{userId} sobre un id equivocado).

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';
const CONTRACTOR_ID_RAW = process.env.MAGIIS_TEST_CONTRACTOR_ID?.trim();
const CONTRACTOR_ID = CONTRACTOR_ID_RAW ? Number.parseInt(CONTRACTOR_ID_RAW, 10) : null;

test.describe.serial('[_mutation] ContractorUserController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear usuario contractor → verificar → eliminar (cleanup)', async ({ magiisApi }) => {
		test.skip(!CONTRACTOR_ID, 'falta MAGIIS_TEST_CONTRACTOR_ID (setear para habilitar mutación de ContractorUser).');

		let userId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const stamp = Date.now();
			const createRes = await magiisApi.postJson(`contractors/${CONTRACTOR_ID}/users`, {
				firstName: `QA-HARNESS-${stamp}`,
				lastName: 'QA-HARNESS',
				email: `qa-harness-${stamp}@example.com`,
				phone: `QA-${stamp}`
			});
			await expect2xx(createRes);
			// createUser devuelve AbleToUseContractorUserResponseDTO (DTO del contractor, sin userId explícito):
			// el id del usuario creado se lee de employeeUserId (ver GAP DE CONTRATO en el encabezado).
			const created = (await createRes.json()) as { employeeUserId?: number };
			userId = created.employeeUserId ?? null;

			// ── verify ──────────────────────────────────────────────────────────
			test.skip(userId === null, 'createUser no devolvió employeeUserId para verificar/limpiar el usuario creado');
			const getRes = await magiisApi.getJson(`contractors/${CONTRACTOR_ID}/users/${userId}`);
			await expect2xx(getRes);
			const user = (await getRes.json()) as { userId?: number };
			expect(user).toHaveProperty('userId');
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (userId !== null) {
				const del = await magiisApi.postJson(`contractors/delete/${userId}`, {});
				expect([200, 204, 404], 'cleanup POST delete tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
