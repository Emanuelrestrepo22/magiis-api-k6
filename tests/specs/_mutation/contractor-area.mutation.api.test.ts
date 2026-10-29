// tests/specs/_mutation/contractor-area.mutation.api.test.ts
// Harness de mutación segura — ContractorAreaController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// GUARD EXTRA: contractor_id NO vive en cfg (cfg = carrierId/driverId). Se lee de
//   MAGIIS_TEST_CONTRACTOR_ID; si falta, el test se salta (no se inventa un id).
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth backend-route-catalog.json → ContractorAreaController):
//   POST   contractorsAreas/{contractor_id}                               → ContractorAreaResponseDTO { id, ... }
//   GET    contractorsAreas/{contractorUserId}                            (lista; buscar el creado por 'area')
//   DELETE contractorsAreas/{contractor_id}/delete/{contractor_area_id}
// Body: ContractorAreaRequestDTO — required: area, costCenter, enabled, identifier.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';
const CONTRACTOR_ID_RAW = process.env.MAGIIS_TEST_CONTRACTOR_ID?.trim();
const CONTRACTOR_ID = CONTRACTOR_ID_RAW ? Number.parseInt(CONTRACTOR_ID_RAW, 10) : null;

test.describe.serial('[_mutation] ContractorAreaController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear área contractor → verificar → eliminar (cleanup)', async ({ magiisApi }) => {
		test.skip(!CONTRACTOR_ID, 'falta MAGIIS_TEST_CONTRACTOR_ID (setear para habilitar mutación de ContractorArea).');

		let contractorAreaId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const areaName = `QA-HARNESS-${Date.now()}`;
			const createRes = await magiisApi.postJson(`contractorsAreas/${CONTRACTOR_ID}`, {
				area: areaName,
				costCenter: 'QA-HARNESS',
				enabled: true,
				identifier: `QA-${Date.now()}`
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as { id?: number };
			contractorAreaId = created.id ?? null;
			expect(contractorAreaId, 'createArea debe devolver id').not.toBeNull();

			// ── verify (GET lista → buscar el creado por 'area') ─────────────────
			const listRes = await magiisApi.getJson(`contractorsAreas/${CONTRACTOR_ID}`);
			await expect2xx(listRes);
			const list = (await listRes.json()) as Array<{ id?: number; area?: string }>;
			expect(Array.isArray(list), 'getContractorAreas debe devolver un array').toBe(true);
			const found = list.find((a) => a.area === areaName);
			expect(found, `área creada '${areaName}' debe aparecer en la lista`).toBeDefined();
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (contractorAreaId !== null) {
				const del = await magiisApi.deleteJson(`contractorsAreas/${CONTRACTOR_ID}/delete/${contractorAreaId}`);
				expect([200, 204, 404], 'cleanup DELETE tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
