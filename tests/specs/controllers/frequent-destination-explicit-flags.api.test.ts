// tests/specs/controllers/frequent-destination-explicit-flags.api.test.ts
// TM-932 (TC03) / TM-933 (TC04, label defect-found) — BUG-MG-682: destino frecuente, flags de
// ruta EXPLÍCITOS y envío MIXTO (un flag explícito + los otros dos en `null` explícito, mismo
// body). Componente: FrequentDestinationApi (updateExplicitRouteFlagOverridesCarrierDefault para
// TM-932, updateSingleFlagWithoutContaminatingOthers para TM-933; ambos delegan en
// updateWithRouteFlags — ver nota de diseño en ese archivo).
//
// Qué cubre:
//   - TM-932/TC03: el valor EXPLÍCITO del request no se aplana ni se sobreescribe con el
//     PARAMETERS del carrier — persiste tal cual se envía. Una fila por cada uno de los 3 flags
//     sobre el carrier bajo prueba (`mg682Data().carrierId`), enviando el CONTRARIO del parámetro
//     vigente (leído en vivo con `carrierParameters`), más una fila adicional que ejercita
//     explícitamente el rol "carrier con PARAMETERS.FASTEST_ROUTE=true" cuando el entorno lo tiene
//     (si no, esa fila queda skipeada con motivo — nunca se toca PARAMETERS para forzarla).
//   - TM-933/TC04: el flag enviado explícito NO contamina la resolución de los otros dos, enviados
//     en `null` explícito en el mismo body — cada uno debe resolverse contra SU PROPIO PARAMETERS
//     del carrier (3 filas, sobre `mg682Data().carrierId`). Label `defect-found`: si el
//     comportamiento real contradice esto, el test queda FAILED a propósito — NUNCA se ajusta el
//     expected para enmascarar un defecto real (Regla #18).
//
// NINGÚN valor esperado se hardcodea: el "contrario al parámetro" (TM-932) y el "propio parámetro"
// de cada flag omitido (TM-933) se leen en vivo con `carrierParameters.readRouteFlagParameters`
// dentro de cada test — el valor persistido puede o no coincidir con el carrier según el entorno y
// según si el defecto reproduce.
//
// ORÁCULO: la aserción de API usa `frequentDestination.readDestinationFlags` (relee por
// `paginated`, que ya serializa los 3 flags como booleanos) — no depende de driver Oracle. Cuando
// hay credenciales Oracle (`db` fixture), se suma la verificación Oracle como pata ADICIONAL,
// nunca bloqueante: ningún test de este archivo skipea por falta de DB.
//
// Qué datos muta: UN destino frecuente REAL por carrier, localizado por Discover
// (`findUpdatableDestination`) — nunca se da de alta uno nuevo. `afterEach` restaura las 3 flags al
// snapshot devuelto por el mismo Discover (leído ANTES de mutar) contra el MISMO id, y verifica el
// restore releyendo por API.
//
// Por qué NO test.describe.configure({ mode: 'serial' }): TM-933 (label defect-found) puede fallar
// legítimamente en cualquiera de sus 3 filas — el modo 'serial' de Playwright aborta (SKIPPED) las
// filas restantes del mismo describe apenas la primera falla, lo que destruiría la evidencia de
// las otras 2 filas del mismo defecto (justo lo que se necesita documentar). El orden secuencial
// (para no pisar el afterEach entre filas que comparten el mismo FD) YA está garantizado por
// `playwright.config.ts` (`fullyParallel: false` ⇒ un único worker por archivo, tests ejecutados
// en orden de declaración) sin ese efecto secundario.

import { test, expect } from '@TestBase';
import { mg682Data, PARAMETER_KEY_BY_FLAG, DB_COLUMN_BY_FLAG } from '@data/mg682';
import type { RouteFlagName } from '@data/mg682';
import type {
	FrequentDestinationApi,
	FrequentDestinationBase,
	RouteFlagsPatch,
	RouteFlagsSnapshot
} from '@components/api/FrequentDestinationApi';
import type { CarrierParametersApi } from '@components/api/CarrierParametersApi';
import type { OracleDb } from '@db/OracleDb';

const ROUTE_FLAGS: readonly RouteFlagName[] = ['avoidTolls', 'avoidHighways', 'fastestRoute'];

interface RouteFlagColumns {
	AVOIDTOLLS: number;
	AVOIDHIGHWAYS: number;
	FASTEST_ROUTE: number | null;
}

function toDbBit(value: boolean): number {
	return value ? 1 : 0;
}

/** Lee las 3 columnas de ruta del destino frecuente — usado SOLO dentro de la pata DB opcional. */
async function readRouteFlagColumns(db: OracleDb, fdId: number): Promise<RouteFlagColumns> {
	const rows = await db.query<RouteFlagColumns>(
		'SELECT AVOIDTOLLS, AVOIDHIGHWAYS, FASTEST_ROUTE FROM FREQUENTDESTINATION WHERE ID = :fdId',
		{ fdId }
	);
	expect(rows, `FREQUENTDESTINATION sin fila para ID=${fdId}`).toHaveLength(1);
	return rows[0];
}

/** Lee en vivo el PARAMETERS.VALUE (boolean-like 'true'/'false') de un carrier, como bit 0/1 — SOLO pata DB. */
async function readCarrierParamBit(db: OracleDb, carrierId: number, key: string): Promise<number> {
	const rows = await db.query<{ VALUE: string }>(
		'SELECT VALUE FROM PARAMETERS WHERE CARRIERACCOUNT_ID = :carrierId AND KEY = :key',
		{ carrierId, key }
	);
	expect(rows, `PARAMETERS sin fila para carrier ${carrierId} / KEY=${key}`).toHaveLength(1);
	return rows[0].VALUE.trim().toLowerCase() === 'true' ? 1 : 0;
}

/** Error sin respuesta HTTP: Playwright lo lanza con prefijo `apiRequestContext.fetch:` (no es un matcher de expect). */
function isTransportError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	if ('matcherResult' in err) return false;
	return /^apiRequestContext\.\w+:/.test(err.message);
}

function sortedFlags(f: RouteFlagsSnapshot): Array<[string, unknown]> {
	return Object.entries(f).sort(([a], [b]) => a.localeCompare(b));
}

interface RestoreState {
	fdId: number;
	carrierId: number;
	carrierRateId: number;
	base: FrequentDestinationBase;
	original: RouteFlagsSnapshot;
}

/**
 * Registra el `afterEach` que restaura los 3 flags de ruta al snapshot pre-mutación (devuelto por
 * el Discover) y verifica el restore RELEYENDO POR API. Devuelve un setter que cada test llama
 * apenas tiene el snapshot — si un test skipea antes de llegar a mutar, el estado queda `null` y
 * el afterEach no hace nada.
 */
function registerRouteFlagsRestore(): (state: RestoreState) => void {
	let state: RestoreState | null = null;
	test.afterEach(async ({ frequentDestination }) => {
		if (!state) return;
		const { fdId, carrierId, carrierRateId, base, original } = state;
		try {
			await frequentDestination.updateWithRouteFlags(fdId, { base, carrierId, flags: original });
		} catch (err) {
			// Solo errores de TRANSPORTE (sin respuesta HTTP, ej. "socket hang up"): la request pudo
			// procesarse aunque se perdió la respuesta. Un status HTTP != 200 (aserción) sigue fallando.
			if (!isTransportError(err)) throw err;
			const current = await frequentDestination.readDestinationFlags(carrierId, { carrierRateId, fdId });
			let outcome = 'already-restored';
			if (!current || JSON.stringify(sortedFlags(current)) !== JSON.stringify(sortedFlags(original))) {
				// No se procesó: reenviar UNA sola vez (si falla otra vez, propaga el error).
				await frequentDestination.updateWithRouteFlags(fdId, { base, carrierId, flags: original });
				outcome = 'resent-once';
			}
			test.info().annotations.push({
				type: 'fd-restore-recovered',
				description: `fdId=${fdId} ${outcome} flags=${JSON.stringify(original)} cause=${(err as Error).message.split('\n')[0]}`
			});
		}
		const restored = await frequentDestination.readDestinationFlags(carrierId, { carrierRateId, fdId });
		expect(restored, `no se pudo releer el destino frecuente ${fdId} tras el restore`).not.toBeNull();
		expect(restored, `el restore de ${fdId} no dejó los flags en su valor original`).toEqual(original);
		state = null;
	});
	return (next) => {
		state = next;
	};
}

type SuiteFixtures = {
	frequentDestination: FrequentDestinationApi;
	carrierParameters: CarrierParametersApi;
	db: OracleDb | null;
};

// ─── TM-932 (TC03) ───────────────────────────────────────────────────────────────────────────────

/**
 * Ejecuta una fila de TM-932: lee PARAMETERS.<flag> en vivo, envía el CONTRARIO explícito (las
 * otras 2 claves omitidas del body) y confirma por API que persiste tal cual. Compartida entre el
 * loop de los 3 flags y la fila adicional del rol "carrier con FASTEST_ROUTE=true".
 */
async function runTm932Case(
	fx: SuiteFixtures,
	setRestoreState: (state: RestoreState) => void,
	carrierId: number,
	flag: RouteFlagName
): Promise<void> {
	const { frequentDestination, carrierParameters, db } = fx;

	const param = await carrierParameters.readRouteFlagParameters(carrierId);
	test.skip(!param, `No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló)`);
	const explicitValue = !param![flag];

	const fd = await frequentDestination.findUpdatableDestination(carrierId);
	test.skip(!fd, `No se encontró un destino frecuente completo para el carrier ${carrierId} (Discover falló)`);

	const { id, currentFlags, ...base } = fd!;
	setRestoreState({ fdId: id, carrierId, carrierRateId: base.carrierRateId, base, original: currentFlags });

	const flags: RouteFlagsPatch = {};
	flags[flag] = explicitValue;
	await frequentDestination.updateExplicitRouteFlagOverridesCarrierDefault(id, { base, carrierId, flags });

	const after = await frequentDestination.readDestinationFlags(carrierId, {
		carrierRateId: base.carrierRateId,
		fdId: id
	});
	expect(after, `no se pudo releer el destino frecuente ${id} tras persistir ${flag} explícito`).not.toBeNull();
	expect(
		after![flag],
		`columna ${flag} tras enviar ${flag}=${explicitValue} explícito (carrier ${carrierId}) — debe persistir el ` +
			`valor CONTRARIO a PARAMETERS.${PARAMETER_KEY_BY_FLAG[flag]}, no aplanarse contra el default del carrier`
	).toBe(explicitValue);

	if (db) {
		const afterDb = await readRouteFlagColumns(db, id);
		expect(
			afterDb[DB_COLUMN_BY_FLAG[flag]],
			`columna DB ${DB_COLUMN_BY_FLAG[flag]} tras enviar ${flag}=${explicitValue} explícito (carrier ${carrierId})`
		).toBe(toDbBit(explicitValue));
	} else {
		test.info().annotations.push({
			type: 'db-leg',
			description: 'sin driver Oracle en este entorno; verificación agéntica adjunta al run de Xray'
		});
	}
}

test.describe('FrequentDestinationController — TM-932: flag explícito no se aplana contra el default del carrier (TC03)', () => {
	const setRestoreState = registerRouteFlagsRestore();

	for (const flag of ROUTE_FLAGS) {
		test(`TM-932: debería persistir ${flag} explícito en el carrier bajo prueba aunque contradiga PARAMETERS.${PARAMETER_KEY_BY_FLAG[flag]}`, async ({
			frequentDestination,
			carrierParameters,
			db
		}) => {
			const { carrierId } = mg682Data();
			await runTm932Case({ frequentDestination, carrierParameters, db }, setRestoreState, carrierId, flag);
		});
	}

	test('TM-932: debería persistir fastestRoute explícito en el carrier con PARAMETERS.FASTEST_ROUTE=true', async ({
		frequentDestination,
		carrierParameters,
		db
	}) => {
		const { carrierWithFastestRouteTrueId } = mg682Data();
		test.skip(
			carrierWithFastestRouteTrueId === null,
			'requiere un carrier con PARAMETERS.FASTEST_ROUTE=true accesible con la credencial del entorno; no disponible en producción'
		);
		await runTm932Case(
			{ frequentDestination, carrierParameters, db },
			setRestoreState,
			carrierWithFastestRouteTrueId!,
			'fastestRoute'
		);
	});
});

// ─── TM-933 (TC04, label defect-found) ──────────────────────────────────────────────────────────

interface Tm933Row {
	sentFlag: RouteFlagName;
	omittedFlags: [RouteFlagName, RouteFlagName];
}

/** Valor explícito del flag bajo prueba en cada fila: es arbitrario — lo que importa es que NO contamine a los otros dos (ver aserciones). */
const TM933_SENT_VALUE = true;

const TM933_ROWS: Tm933Row[] = [
	{ sentFlag: 'fastestRoute', omittedFlags: ['avoidTolls', 'avoidHighways'] },
	{ sentFlag: 'avoidTolls', omittedFlags: ['avoidHighways', 'fastestRoute'] },
	{ sentFlag: 'avoidHighways', omittedFlags: ['avoidTolls', 'fastestRoute'] }
];

test.describe('FrequentDestinationController — TM-933: un flag explícito no contamina la resolución de los otros dos (TC04, defect-found)', () => {
	const setRestoreState = registerRouteFlagsRestore();

	for (const row of TM933_ROWS) {
		test(`TM-933: debería resolver ${row.omittedFlags[0]} y ${row.omittedFlags[1]} contra PARAMETERS del carrier bajo prueba cuando ${row.sentFlag}=${TM933_SENT_VALUE} viaja explícito y los otros dos en null`, async ({
			frequentDestination,
			carrierParameters,
			db
		}) => {
			const { carrierId } = mg682Data();

			const fd = await frequentDestination.findUpdatableDestination(carrierId);
			test.skip(!fd, `No se encontró un destino frecuente completo para el carrier ${carrierId} (Discover falló)`);

			const { id, currentFlags, ...base } = fd!;
			setRestoreState({ fdId: id, carrierId, carrierRateId: base.carrierRateId, base, original: currentFlags });

			const flags: RouteFlagsPatch = {};
			flags[row.sentFlag] = TM933_SENT_VALUE;
			flags[row.omittedFlags[0]] = null;
			flags[row.omittedFlags[1]] = null;
			await frequentDestination.updateSingleFlagWithoutContaminatingOthers(id, { base, carrierId, flags });

			const after = await frequentDestination.readDestinationFlags(carrierId, {
				carrierRateId: base.carrierRateId,
				fdId: id
			});
			expect(after, `no se pudo releer el destino frecuente ${id} tras el update`).not.toBeNull();

			expect(after![row.sentFlag], `columna del flag enviado (${row.sentFlag}=${TM933_SENT_VALUE} explícito)`).toBe(
				TM933_SENT_VALUE
			);

			// TC04 (defect-found): cada flag OMITIDO (null explícito) debe resolverse contra SU PROPIO
			// PARAMETERS del carrier — leído en vivo, nunca hardcodeado — sin importar qué se envió en
			// el flag hermano. Si el mapper contamina, esta aserción es la que falla y documenta el defecto.
			const param = await carrierParameters.readRouteFlagParameters(carrierId);
			test.skip(!param, `No se pudo leer PARAMETERS del carrier ${carrierId} (Discover falló)`);
			for (const omittedFlag of row.omittedFlags) {
				expect(
					after![omittedFlag],
					`columna omitida ${omittedFlag} (PARAMETERS.${PARAMETER_KEY_BY_FLAG[omittedFlag]}) tras enviar ` +
						`${row.sentFlag}=${TM933_SENT_VALUE} explícito — no debe contaminarse con el flag hermano`
				).toBe(param![omittedFlag]);
			}

			if (db) {
				const afterDb = await readRouteFlagColumns(db, id);
				expect(
					afterDb[DB_COLUMN_BY_FLAG[row.sentFlag]],
					`columna DB del flag enviado (${row.sentFlag}=${TM933_SENT_VALUE} explícito)`
				).toBe(toDbBit(TM933_SENT_VALUE));
				for (const omittedFlag of row.omittedFlags) {
					const expectedBit = await readCarrierParamBit(db, carrierId, PARAMETER_KEY_BY_FLAG[omittedFlag]);
					expect(
						afterDb[DB_COLUMN_BY_FLAG[omittedFlag]],
						`columna DB omitida ${omittedFlag} (PARAMETERS.${PARAMETER_KEY_BY_FLAG[omittedFlag]}) tras enviar ` +
							`${row.sentFlag}=${TM933_SENT_VALUE} explícito`
					).toBe(expectedBit);
				}
			} else {
				test.info().annotations.push({
					type: 'db-leg',
					description: 'sin driver Oracle en este entorno; verificación agéntica adjunta al run de Xray'
				});
			}
		});
	}
});
