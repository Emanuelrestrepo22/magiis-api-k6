// tests/specs/_mutation/carrier-area.mutation.api.test.ts
// Harness de mutación segura — CarrierAreasController (ver piloto carrier-zone + docs/reference/mutation-harness.md).
// Ciclo create → verify → cleanup (CRUD cerrado, bajo riesgo).
//
// DOBLE GUARD (idéntico al piloto):
//   - se salta salvo ALLOW_MUTATIONS=1 (opt-in explícito + luz verde del QA Lead);
//   - NUNCA corre contra PROD (ENV=prod) — regla dura, no se muta producción.
// El cleanup en finally garantiza no dejar residuos.
//
// Rutas (catálogo ground-truth backend-route-catalog.json → CarrierAreasController):
//   POST   carriers/{carrierId}/carrierArea            → CarrierAreaResponseDTO { id, ... }
//   GET    carriers/{carrierId}/carrierArea/{areaId}
//   DELETE carriers/{carrierId}/carrierArea/{areaId}
// Body: CarrierAreaRequestDTO (source magiis-be) — enums CODIFICADOS, no strings libres:
//   areaType: "P" polygon | "C" circle | "Z" zipcode   (CarrierAreaRequestDTO.java:14; switch en CarrierAreasService.java:65)
//   opeType:  "O" operation | "E" exclution | "C" control (CarrierAreaRequestDTO.java:22)
//   Si areaType="P" → polygonList (ArrayList<PointRequestDTO>) es OBLIGATORIO, si no: throw "Polygon not valid" → 409 (CarrierAreasService.java:80-92).
//   opeType="C" evita el escaneo de intersección de opeType="O" (getIntersectionAreasByList, línea 88): create determinista, sin depender de las áreas ya cargadas del carrier.

import { test, expect } from '@TestBase';
import { expect2xx } from '@helpers';

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'test') === 'prod';

test.describe.serial('[_mutation] CarrierAreasController — create→verify→cleanup', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo TEST).');

	test('ciclo seguro: crear área → verificar → eliminar (cleanup)', async ({ magiisApi, cfg }) => {
		let areaId: number | null = null;

		try {
			// ── create ──────────────────────────────────────────────────────────
			const areaDescription = `QA-HARNESS-${Date.now()}`;
			const createRes = await magiisApi.postJson(`carriers/${cfg.carrierId}/carrierArea`, {
				areaType: 'P', // P = polygon (único valor válido junto a C/Z — CarrierAreaRequestDTO.java:14)
				description: areaDescription,
				opeType: 'C', // C = control (O/E/C — CarrierAreaRequestDTO.java:22); "C" salta el escaneo de intersección
				// polygonList requerido para areaType="P" (CarrierAreasService.java:80-92); polígono neutro (~2km, sin unique constraint)
				polygonList: [
					{ latitude: 40.0, longitude: -74.0 },
					{ latitude: 40.02, longitude: -74.0 },
					{ latitude: 40.02, longitude: -74.02 },
					{ latitude: 40.0, longitude: -74.02 }
				]
			});
			await expect2xx(createRes);
			const created = (await createRes.json()) as { id?: number };
			areaId = created.id ?? null;
			expect(areaId, 'createCarrierArea debe devolver id').not.toBeNull();

			// ── verify ──────────────────────────────────────────────────────────
			const getRes = await magiisApi.getJson(`carriers/${cfg.carrierId}/carrierArea/${areaId}`);
			await expect2xx(getRes);
			const area = (await getRes.json()) as { id?: number };
			expect(area).toHaveProperty('id');
		} finally {
			// ── cleanup (idempotente) ──────────────────────────────────────────
			if (areaId !== null) {
				const del = await magiisApi.deleteJson(`carriers/${cfg.carrierId}/carrierArea/${areaId}`);
				expect([200, 204, 404], 'cleanup DELETE tolera 404 (ya eliminado)').toContain(del.status());
			}
		}
	});
});
