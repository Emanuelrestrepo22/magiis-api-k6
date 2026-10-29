// tests/specs/controllers/travels-times.api.test.ts
// TM-934 (TC05, Xray TM) — BUG-MG-682: POST /travels/times resuelve los tres flags de ruta
// contra PARAMETERS del carrier cuando la request no los envía. Componente: TravelsApi.
//
// Filas: una por flag (avoidTolls/avoidHighways/fastestRoute) sobre el carrier del entorno activo
// (mg682Data().carrierId), más una fila adicional para el carrier con PARAMETERS.FASTEST_ROUTE=
// true (si existe en el entorno — si no, esa fila SKIPEA con motivo explícito; nunca se "arregla"
// tocando PARAMETERS). El esperado de cada fila se LEE EN VIVO de carrierParameters.
// readRouteFlagParameters(carrierId) (nunca hardcodeado): el oráculo es lo que el carrier tiene
// configurado, no una constante que rompe al cambiar de entorno.
//
// Pata DB (MAGIIS_ROUTES, tabla de caché por par origen/destino): OBLIGATORIA para verificar el
// flag — la respuesta de /travels/times no expone FASTEST_ROUTE/AVOIDTOLLS/AVOIDHIGHWAYS, así que
// no existe oráculo API alternativo para este caso. Sin credenciales Oracle el test SKIPEA con
// motivo explícito (nunca continúa por una rama que asertaría algo no relacionado con TM-934 y
// reportaría PASSED en falso — ver OracleDb.ts `oracleConfigFromEnv`).
//
// ORÁCULO DB — el WHERE (los tres flags, ver por qué en el módulo compartido) y el patrón de
// atribución por `USED` before/after viven en `@components/db/routeRowOracle` (`readRouteRow`),
// reusado también por travels-create-route-flags.api.test.ts (TM-945, filas simulate/simulateAll)
// para que ambas suites no mantengan dos copias del mismo WHERE contra el índice único.

import { test, expect } from '@TestBase';
import { mg682Data, PARAMETER_KEY_BY_FLAG, UNDERSCORED_DB_COLUMN_BY_FLAG, type RouteFlagName } from '@data/mg682';
import { flagBit } from '@components/api/CarrierParametersApi';
import { readRouteRow } from '@components/db/routeRowOracle';

const FLAGS: RouteFlagName[] = ['avoidTolls', 'avoidHighways', 'fastestRoute'];

test.describe('TravelController — TM-934: flags de ruta contra el parámetro del carrier', () => {
	for (const flag of FLAGS) {
		test(`TM-934: debería resolver ${flag} contra PARAMETERS.${PARAMETER_KEY_BY_FLAG[flag]} del carrier cuando /travels/times no lo envía`, async ({
			travels,
			carrierParameters,
			db
		}) => {
			const { carrierId, route } = mg682Data();

			const params = await carrierParameters.readRouteFlagParameters(carrierId);
			test.skip(
				!params,
				`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
			);

			test.skip(
				!db,
				`Sin credenciales Oracle (ver ORACLE_* en .env.<env>): MAGIIS_ROUTES.${UNDERSCORED_DB_COLUMN_BY_FLAG[flag]} no es verificable — /travels/times no expone el flag en la respuesta, no hay oráculo API alternativo para TM-934.`
			);

			const flagValues = {
				avoidHighways: flagBit(params!, 'avoidHighways'),
				avoidTolls: flagBit(params!, 'avoidTolls'),
				fastestRoute: flagBit(params!, 'fastestRoute')
			};
			// Snapshot ANTES del request: puede no existir todavía (próximo request = INSERT).
			const before = await readRouteRow(db!, route, flagValues);

			await travels.requestTimesOmittingFlagsResolvesAgainstCarrierParameter(carrierId, route);

			const after = await readRouteRow(db!, route, flagValues);
			expect(
				after,
				`ninguna fila de MAGIIS_ROUTES coincide con la combinación de flags esperada tras el request — ` +
					`${flag} no resolvió contra PARAMETERS como debía`
			).not.toBeNull();
			expect(
				after!.USED ?? 0,
				`la fila (ID ${after!.ID}) existe pero su contador USED no subió respecto del snapshot previo a este ` +
					`request (before=${before?.USED ?? 'sin fila'}, after=${after!.USED}): esta ejecución no la tocó, ` +
					`el verde no le sería atribuible`
			).toBeGreaterThan(before?.USED ?? 0);
		});
	}

	test('TM-934: debería resolver fastestRoute contra PARAMETERS.FASTEST_ROUTE=true de un carrier con ese parámetro cuando /travels/times no lo envía', async ({
		travels,
		carrierParameters,
		db
	}) => {
		const { carrierWithFastestRouteTrueId, route } = mg682Data();
		test.skip(
			carrierWithFastestRouteTrueId === null,
			'requiere un carrier con PARAMETERS.FASTEST_ROUTE=true accesible con la credencial del entorno; no disponible en producción'
		);
		const carrierId = carrierWithFastestRouteTrueId!;

		const params = await carrierParameters.readRouteFlagParameters(carrierId);
		test.skip(
			!params,
			`No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló) — sin oráculo no hay expected.`
		);

		test.skip(
			!db,
			`Sin credenciales Oracle (ver ORACLE_* en .env.<env>): MAGIIS_ROUTES.${UNDERSCORED_DB_COLUMN_BY_FLAG.fastestRoute} no es verificable — /travels/times no expone el flag en la respuesta, no hay oráculo API alternativo para TM-934.`
		);

		const flagValues = {
			avoidHighways: flagBit(params!, 'avoidHighways'),
			avoidTolls: flagBit(params!, 'avoidTolls'),
			fastestRoute: flagBit(params!, 'fastestRoute')
		};
		const before = await readRouteRow(db!, route, flagValues);

		await travels.requestTimesOmittingFlagsResolvesAgainstCarrierParameter(carrierId, route);

		const after = await readRouteRow(db!, route, flagValues);
		expect(
			after,
			`ninguna fila de MAGIIS_ROUTES coincide con la combinación de flags esperada tras el request — ` +
				`fastestRoute no resolvió contra PARAMETERS.FASTEST_ROUTE=true como debía`
		).not.toBeNull();
		expect(
			after!.USED ?? 0,
			`la fila (ID ${after!.ID}) existe pero su contador USED no subió respecto del snapshot previo a este ` +
				`request (before=${before?.USED ?? 'sin fila'}, after=${after!.USED}): esta ejecución no la tocó, ` +
				`el verde no le sería atribuible`
		).toBeGreaterThan(before?.USED ?? 0);
	});
});
