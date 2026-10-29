// tests/specs/controllers/data-quality-null-flags.api.test.ts
// TM-947 (TC18, Xray TM) — BUG-MG-682: verificación de calidad de datos, no un ATC de componente.
// Confirma 0 filas con flags de ruta en NULL en TRAVEL/RECURRING_TRIPS/AFFI_OS_TRAVEL tras el
// saneo del 2026-09-02. 100% DB — usa el fixture `db` (OracleDb) directamente, sin componente.

import { test, expect } from '@TestBase';
import { DB_COLUMN_BY_FLAG, UNDERSCORED_DB_COLUMN_BY_FLAG } from '@data/mg682';

test.describe('MG-682 — TM-947: saneo de flags de ruta', () => {
	test('TM-947: debería no mostrar ninguna fila con los flags de ruta en NULL en TRAVEL, RECURRING_TRIPS ni AFFI_OS_TRAVEL tras el saneo', async ({
		db
	}) => {
		test.skip(
			!db,
			'verificación 100% DB; sin driver Oracle en este entorno se resuelve de forma agéntica contra la réplica de lectura y se adjunta al run de Xray'
		);

		const travelNulls = await db!.query<{ COUNT: number }>(
			`SELECT COUNT(*) AS COUNT FROM TRAVEL WHERE ${DB_COLUMN_BY_FLAG.fastestRoute} IS NULL`
		);
		expect(travelNulls[0].COUNT).toBe(0);

		const recurringNulls = await db!.query<{ COUNT: number }>(
			`SELECT COUNT(*) AS COUNT FROM RECURRING_TRIPS WHERE ${DB_COLUMN_BY_FLAG.fastestRoute} IS NULL OR ${DB_COLUMN_BY_FLAG.avoidTolls} IS NULL OR ${DB_COLUMN_BY_FLAG.avoidHighways} IS NULL`
		);
		expect(recurringNulls[0].COUNT).toBe(0);

		const affiOsNulls = await db!.query<{ COUNT: number }>(
			`SELECT COUNT(*) AS COUNT FROM AFFI_OS_TRAVEL WHERE ${UNDERSCORED_DB_COLUMN_BY_FLAG.fastestRoute} IS NULL OR ${UNDERSCORED_DB_COLUMN_BY_FLAG.avoidTolls} IS NULL OR ${UNDERSCORED_DB_COLUMN_BY_FLAG.avoidHighways} IS NULL`
		);
		expect(affiOsNulls[0].COUNT).toBe(0);
	});
});
