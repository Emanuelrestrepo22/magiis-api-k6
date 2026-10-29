// tests/specs/_mutation/carrier-service-types.mutation.api.test.ts
// Harness de mutación segura — CarrierServiceTypesController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth openapi.yaml → CarrierServiceTypes):
//   POST carriers/{carrierId}/serviceTypes/create                    → Long id  (body CarrierServiceTypeRequestDTO)
//   GET  carriers/{carrierId}/serviceTypes/{serviceTypeId}           → CarrierServiceTypeResponseDTO { id, name, ... }
//   POST carriers/{carrierId}/serviceTypes/{serviceTypeId}/delete    → boolean  (body CarrierServiceTypeDeleteRequestDTO)
// Body create: CarrierServiceTypeRequestDTO. Constraint REAL deducida del source (no del schema):
//   saveCarrierServiceType() llama defineStep(...) (CarrierServiceTypeService.java:202) que hace
//   request.getVehicleTypesOnDemand().size() y desempaqueta vehicleTypeOnDemandAll (:524). Con ambos
//   campos NULL (no enviados) → NullPointerException → el create no devuelve el Long id (falla expect2xx).
//   Fix: enviar vehicleTypeOnDemandAll:false + vehicleTypesOnDemand:[] (sin vehículos, neutro).
//   Nota: el service IGNORA `type` (setServiceType("CUSTOM") hardcodeado, :80). No hay enum de type ni
//   unicidad de name/code — la entidad no tiene @Column(unique) ni columna `code`.
// Body delete: CarrierServiceTypeDeleteRequestDTO — solo userId (opcional); se envía {} al no haber contexto de usuario.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';

test.describe.serial('[_mutation] CarrierServiceTypesController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear serviceType → verificar → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		let serviceTypeId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const serviceTypeName = `QA-HARNESS-${Date.now()}`;
			const createRes = await magiisApi.postJson(`carriers/${cfg.carrierId}/serviceTypes/create`, {
				name: serviceTypeName,
				shortName: 'QA-HARN',
				description: 'QA harness mutation cycle',
				active: true,
				// `type` lo ignora el service (setServiceType("CUSTOM") hardcodeado en :80); se manda CUSTOM por coherencia.
				type: 'CUSTOM',
				// Obligatorios de facto: defineStep() (Service:202,524) hace .size() sobre vehicleTypesOnDemand
				// y desempaqueta vehicleTypeOnDemandAll. Sin ellos → NPE. Lista vacía = alta sin vehículos (neutro).
				vehicleTypeOnDemandAll: false,
				vehicleTypesOnDemand: []
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as number;
			serviceTypeId = typeof created === 'number' ? created : null;
			expect(serviceTypeId, 'addServiceType debe devolver id (Long)').not.toBeNull();

			// ── verify ──────────────────────────────────────────────────────────
			const getRes = await magiisApi.getJson(`carriers/${cfg.carrierId}/serviceTypes/${serviceTypeId}`);
			await expect2xx(getRes);
			const svc = (await getRes.json()) as { id?: number; name?: string };
			expect(svc).toHaveProperty('id');
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (serviceTypeId !== null) {
				const del = await magiisApi.postJson(`carriers/${cfg.carrierId}/serviceTypes/${serviceTypeId}/delete`, {});
				expect([200, 204, 404], 'cleanup POST delete tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
