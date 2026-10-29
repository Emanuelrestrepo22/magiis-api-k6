// tests/specs/_mutation/carrier-user.mutation.api.test.ts
// Harness de mutación segura — CarrierUserController (ver pilotos carrier-zone / carrier-service-types + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico a los pilotos):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (grounded en el SOURCE — CarrierUserController.java):
//   POST carriers/create                        → Long userId  (body UserRequestDTO)
//   GET  carriers/carrierUser/{carrierId}/paginated → Page<UserDTO> (verify del sub-user)
//   POST carriers/delete/{userId}                → 200 OK (sin body)
//
// CONSTRAINTS deducidas del SOURCE (por eso NO se usa el payload original):
//   1) UserRequestDTO.role es un ENUM MagiisRole (UserRequestDTO.java:24), NO un String libre.
//      'ROLE_CARRIER' NO existe en el enum (MagiisRole.java) → Jackson falla al deserializar
//      el body → HttpMessageNotReadableException → 400 (ese era el 4xx observado en carrier 1040).
//      Valor válido usado: 'CARRIER_OPERATOR' (rol de sub-usuario, borrable).
//   2) El create NO puede usar rol 'CARRIER': delete() lo prohíbe (CarrierUserService.java:199-202,
//      CARRIER_NOT_AVAILABLE → 400) ⇒ el cleanup dejaría residuo. Además sería crear un 2º
//      "dueño transportista". Por eso el recurso creado es un sub-usuario CARRIER_*.
//   3) VERIFY: el GET carrierUser/{userId} exige rol CARRIER (Controller:193-196) → 404 para un
//      sub-usuario. Se verifica con el paginado carrierUser/{carrierId}/paginated, cuyo query
//      filtra rol.roleName LIKE 'CARRIER_%' (CarrierUserRepository.java:33) y expone id = u.user.id
//      (línea 27) == el userId que devuelve create y el {userId} del delete.
//
// Body create: UserRequestDTO — required (@NonNull): carrierId, email, firstName, lastName, role.
//   carrierId sale de cfg.carrierId; role='CARRIER_OPERATOR'; email/firstName únicos con Date.now().
// SIDE EFFECT documentado: el create dispara sendWelcomeCarrierUserEmail (CarrierUserService.java:181,
//   con password random). El email va a un dominio reservado .example (RFC 2606, no-routable) ⇒ rebota
//   sin entregar. El envío está en try/catch en el service, no afecta el retorno del userId.

import { test, expect } from '@TestBase';
import { expect2xx, expectPageShape } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';

test.describe.serial('[_mutation] CarrierUserController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear carrierUser → verificar → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		let userId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const tag = `QA-HARNESS-${Date.now()}`;
			const createRes = await magiisApi.postJson('carriers/create', {
				carrierId: cfg.carrierId,
				email: `${tag.toLowerCase()}@qa-harness.example`,
				firstName: tag,
				lastName: 'QA-Harness',
				role: 'CARRIER_OPERATOR'
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as number;
			userId = typeof created === 'number' ? created : null;
			expect(userId, 'create debe devolver userId (Long)').not.toBeNull();

			// ── verify ──────────────────────────────────────────────────────────
			// El paginado filtra rol.roleName LIKE 'CARRIER_%' y ordena por id; con sort=DESC
			// el sub-usuario recién creado (id más alto) queda entre los primeros → se busca por id.
			// page:1 explícito — el backend hace Optional.get(page) unguarded (1-indexed) → 500 si se omite.
			const listRes = await magiisApi.getJson(`carriers/carrierUser/${cfg.carrierId}/paginated`, {
				params: { page: 1, column: 'id', sort: 'DESC', size: 50 }
			});
			const page = await expectPageShape<{ id?: number }>(listRes);
			expect(
				page.content.some((u) => u.id === userId),
				'el sub-usuario creado (CARRIER_OPERATOR) debe aparecer en el paginado del carrier'
			).toBe(true);
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (userId !== null) {
				const del = await magiisApi.postJson(`carriers/delete/${userId}`, {});
				expect([200, 204, 404], 'cleanup POST delete tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
