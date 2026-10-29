// tests/data/f2/cancel.ts
// Limpieza de los specs de mutación de la campaña F2 (PK-A): cancela el viaje de prueba por la acción real
// (`TravelsApi.cancelTravel`, PUT .../cancel) y VERIFICA por DB que quedó en STATE 7. Se usa desde `afterEach`.

import { expect } from '@playwright/test';
import type { TravelsApi } from '@api/TravelsApi';
import type { OracleDb } from '@db/OracleDb';
import { observe } from '@data/f2/observe';
import { pace } from '@data/f2/pace';

export interface TravelToCancel {
	carrierId: number;
	travelId: number;
	/** Test que lo creó (para la evidencia). */
	label: string;
}

/** Cancela el viaje y verifica STATE 7 por DB (condición observable, sin esperas fijas); deja `red-cancel-<id>.json`. */
export async function cancelAndVerify(travels: TravelsApi, db: OracleDb | null, trip: TravelToCancel): Promise<void> {
	await pace();
	await travels.cancelTravel(trip.carrierId, trip.travelId);
	let state: number | undefined;
	if (db) {
		await expect
			.poll(
				async () => {
					const rows = await db.query<{ STATE: number }>('SELECT STATE FROM TRAVEL WHERE ID = :id', {
						id: trip.travelId
					});
					state = rows[0]?.STATE;
					return state;
				},
				{ message: `el viaje ${trip.travelId} debe quedar cancelado (STATE 7)`, timeout: 15_000 }
			)
			.toBe(7);
	}
	await observe(`cancel-${trip.travelId}`, {
		endpoint: `PUT carriers/${trip.carrierId}/travels/${trip.travelId}/cancel`,
		variation: { test: trip.label },
		status: 200,
		response: { travelId: trip.travelId, stateAfterCancel: state ?? '(sin DB: no verificado)' }
	});
}
