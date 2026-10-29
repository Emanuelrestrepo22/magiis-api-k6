// tests/specs/_mutation/contractor-employee.mutation.api.test.ts
// Harness de mutación segura — ContractorEmployeeController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// GUARD EXTRA: contractor_id NO vive en cfg (cfg = carrierId/driverId). Se lee de
//   MAGIIS_TEST_CONTRACTOR_ID; si falta, el test se salta (no se inventa un id).
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth backend-route-catalog.json → ContractorEmployeeController):
//   POST   contractorEmployees/{contractor_id}                → ContractorEmployeeResponseDTO { id, passengerId, userType }
//   GET    contractorEmployees/{contractorEmployeeId}         → ContractorEmployeeResponseDTO (id req)
//   DELETE contractorEmployees/{employee_id}                  (idempotente)
// Body create: ContractorEmployeeRequestDTO — sin campos required en el schema; se envían solo campos existentes
// (name, lastName, email, phone). Sin enum en el schema.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';
const CONTRACTOR_ID_RAW = process.env.MAGIIS_TEST_CONTRACTOR_ID?.trim();
const CONTRACTOR_ID = CONTRACTOR_ID_RAW ? Number.parseInt(CONTRACTOR_ID_RAW, 10) : null;

test.describe.serial('[_mutation] ContractorEmployeeController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear empleado contractor → verificar → eliminar (cleanup)', async ({ magiisApi }) => {
		test.skip(
			!CONTRACTOR_ID,
			'falta MAGIIS_TEST_CONTRACTOR_ID (setear para habilitar mutación de ContractorEmployee).'
		);

		let contractorEmployeeId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const stamp = Date.now();
			const createRes = await magiisApi.postJson(`contractorEmployees/${CONTRACTOR_ID}`, {
				name: `QA-HARNESS-${stamp}`,
				lastName: 'QA-HARNESS',
				email: `qa-harness-${stamp}@example.com`,
				phone: `QA-${stamp}`
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as { id?: number };
			contractorEmployeeId = created.id ?? null;
			expect(contractorEmployeeId, 'createEmployee debe devolver id').not.toBeNull();

			// ── verify ──────────────────────────────────────────────────────────
			const getRes = await magiisApi.getJson(`contractorEmployees/${contractorEmployeeId}`);
			await expect2xx(getRes);
			const employee = (await getRes.json()) as { id?: number };
			expect(employee).toHaveProperty('id');
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (contractorEmployeeId !== null) {
				const del = await magiisApi.deleteJson(`contractorEmployees/${contractorEmployeeId}`);
				expect([200, 204, 404], 'cleanup DELETE tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
