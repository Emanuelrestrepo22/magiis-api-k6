// tests/specs/controllers/frequent-destination.api.test.ts
// TM-930 (TC01, Xray TM) — BUG-MG-682: destino frecuente, flags de ruta nunca en NULL.
// Componente: FrequentDestinationApi. Carrier resuelto por entorno vía `mg682Data()` — nunca
// hardcodeado, así el caso corre igual en TEST/UAT/PROD.
//
// ORÁCULO: `frequentDestination.readDestinationFlags` relee el destino por API (el endpoint
// `paginated` ya serializa los 3 flags como booleanos por elemento) — no depende de driver Oracle.
// Cuando hay credenciales Oracle (`db` fixture), la pata DB se ejecuta como verificación ADICIONAL
// sobre `FREQUENTDESTINATION`, nunca como condición de skip: este caso NUNCA skipea por falta de DB.

import { test, expect } from '@TestBase';
import { mg682Data } from '@data/mg682';
import type { FrequentDestinationBase, RouteFlagsSnapshot } from '@components/api/FrequentDestinationApi';

interface RestoreState {
	fdId: number;
	carrierId: number;
	carrierRateId: number;
	base: FrequentDestinationBase;
	original: RouteFlagsSnapshot;
}

test.describe('FrequentDestinationController — TM-930: flags de ruta nunca NULL', () => {
	let restoreState: RestoreState | null = null;

	test.afterEach(async ({ frequentDestination }) => {
		if (!restoreState) return;
		const { fdId, carrierId, carrierRateId, base, original } = restoreState;
		await frequentDestination.updateWithRouteFlags(fdId, { base, carrierId, flags: original });
		const restored = await frequentDestination.readDestinationFlags(carrierId, { carrierRateId, fdId });
		expect(restored, `no se pudo releer el destino frecuente ${fdId} tras el restore`).not.toBeNull();
		expect(restored, `el restore de ${fdId} no dejó los flags en su valor original`).toEqual(original);
		restoreState = null;
	});

	test('TM-930: debería persistir avoidTolls, avoidHighways y fastestRoute con un valor boolean -nunca en NULL- cuando se edita un destino frecuente sin enviarlos', async ({
		frequentDestination,
		db
	}) => {
		const { carrierId } = mg682Data();

		const fd = await frequentDestination.findUpdatableDestination(carrierId);
		test.skip(!fd, `No se encontró un destino frecuente completo para el carrier ${carrierId} (Discover falló)`);

		const { id, currentFlags, ...base } = fd!;
		restoreState = { fdId: id, carrierId, carrierRateId: base.carrierRateId, base, original: currentFlags };

		await frequentDestination.updateOmittingRouteFlagsNeverPersistsNull(id, {
			base,
			carrierId,
			flags: { avoidTolls: null, avoidHighways: null, fastestRoute: null }
		});

		const after = await frequentDestination.readDestinationFlags(carrierId, {
			carrierRateId: base.carrierRateId,
			fdId: id
		});
		expect(after, `no se pudo releer el destino frecuente ${id} tras el update`).not.toBeNull();
		expect(typeof after!.avoidTolls, 'avoidTolls nunca debe persistir NULL').toBe('boolean');
		expect(typeof after!.avoidHighways, 'avoidHighways nunca debe persistir NULL').toBe('boolean');
		expect(typeof after!.fastestRoute, 'fastestRoute nunca debe persistir NULL').toBe('boolean');

		if (db) {
			await db.expectNoNulls(
				'SELECT FASTEST_ROUTE, AVOIDTOLLS, AVOIDHIGHWAYS FROM FREQUENTDESTINATION WHERE ID = :fdId',
				['FASTEST_ROUTE', 'AVOIDTOLLS', 'AVOIDHIGHWAYS'],
				{ fdId: id }
			);
			const rows = await db.query<{ FASTEST_ROUTE: number; AVOIDTOLLS: number; AVOIDHIGHWAYS: number }>(
				'SELECT FASTEST_ROUTE, AVOIDTOLLS, AVOIDHIGHWAYS FROM FREQUENTDESTINATION WHERE ID = :fdId',
				{ fdId: id }
			);
			expect([0, 1]).toContain(rows[0].FASTEST_ROUTE);
			expect([0, 1]).toContain(rows[0].AVOIDTOLLS);
			expect([0, 1]).toContain(rows[0].AVOIDHIGHWAYS);
		} else {
			test.info().annotations.push({
				type: 'db-leg',
				description: 'sin driver Oracle en este entorno; verificación agéntica adjunta al run de Xray'
			});
		}
	});
});
