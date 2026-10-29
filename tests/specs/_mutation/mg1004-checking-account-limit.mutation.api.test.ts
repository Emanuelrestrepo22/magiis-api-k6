// tests/specs/_mutation/mg1004-checking-account-limit.mutation.api.test.ts
// MG-1004 — contrato de API del ATP TM-1285 (TM-1394): `checkExceedingLimit` evalúa el saldo disponible de la
// cuenta corriente según el límite y «Permite exceder». PK-A (21/10/2026), plan docs/plans/PK-A-contrato-api-alta-*.md.
//
// Runs target ENV=test (carrier 1521). Sujeto: el cliente PROPIO de QA «QA F2 D3 Bimonetario» (contractor 1761) y su
// empleado «QA Colab ConCC», en su cuenta corriente USD (decisión QA lead 21/10: nunca McLaren ni otro cliente real).
//
// PLAN (escenario <-> key Xray <-> oráculo) — Gherkin «Esperado corregido 15/10/2026»
//   saldo = I + 0,01 con «Permite exceder» apagado -> NOT_EXCEEDED
//   saldo = I − 0,01 con «Permite exceder» apagado -> NOT_EXCEEDED (el control NO usa el importe del viaje)
//   saldo ≤ 0       con «Permite exceder» apagado -> EXCEEDED (se ejercen = 0, el borde, y = −0,01)
//   `I` es el importe de venta de `simulateAll` en vivo; el límite se ajusta a (DEBITSUM − CREDITSUM) + saldo deseado.
//   Fuera: las dos filas ARS 6202 (D-BE-5 «pendiente de definición» + bimonetario) y la fila opcional «Permite exceder
//   encendido» (el Gherkin no trae oráculo y no se midió).
//   NO se asierta si `create` revalida o no el límite (observado el 15/10: viaje 71315 creado con saldo < I; pregunta
//   abierta P4 a Dev): este spec no crea viajes.
//
// MUTACIÓN DE DATO COMPARTIDO (R-1): cambia `CHECKINGACCOUNTLIMIT` y `EXCEEDINGLIMIT` de UNA cuenta de QA vía
// `updateCompany`. Antes de tocar nada se guardan los valores originales (annotation `cc-original` y JSON de evidencia);
// `afterEach` los restaura y VERIFICA por DB. Si la restauración falla, el error dice con qué valores reponer a mano.
// Ventana del job de saldo (BALANCE): por defecto se saltea el minuto UTC 40-49 de cada hora
// (`CC_BALANCE_JOB_WINDOW=40-50`; `off` la desactiva). A confirmar con Dev si sigue vigente (pregunta P3).
//
// GUARDAS: doble (ALLOW_MUTATIONS=1 y nunca prod); 0 viajes creados.
// Crédito: `tms_only` (el ATC de TravelsApi corre también en otros specs).

import { test, expect } from '@TestBase';
import { F2_EMPLOYEES, F2_NOTES, F2_TEST_ONLY_REASON, buildSimulateBody, discoverEmployee, isF2Env } from '@data/f2';
import { BASELINE_TRAVELS, resolveBaseline } from '@data/f2/baseline';
import { observe } from '@data/f2/observe';
import { pace } from '@data/f2/pace';
import { pickByVehicle } from '@data/f2/simulation';
import type { ExceedingLimitStatus, SimulationBreakdown } from '@api/TravelsApi';

const VEHICLE_TYPE_ID = 1;

const CC_SQL = `SELECT ca.ID, ca.PASSENGERACCOUNT_ID, ca.CURRENCY_ID, ca.BALANCE, ca.CREDITSUM, ca.DEBITSUM, ca.CHECKINGACCOUNTLIMIT, ca.EXCEEDINGLIMIT
FROM CAR_CON_RELATION r JOIN PASSENGERACCOUNT pa ON pa.ID = r.PASSENGER_ACCOUNT
JOIN CHECKINGACCOUNT ca ON ca.PASSENGERACCOUNT_ID = pa.ID
WHERE r.CONTRACTOR_ACCOUNT = :contractorId AND r.CARRIER_ACCOUNT = :carrierId AND ca.CURRENCY_ID = :currencyId`;

/**
 * El control `checkExceedingLimit` resuelve `findPassenger(passengerId).getPassengerAccountByCarrier(carrier)`: si el
 * pasajero no tiene PASSENGERACCOUNT en el carrier responde NOT_EXCEEDED sin mirar ninguna cuenta. Esta consulta
 * prueba que el `passengerId` que se va a enviar ES el dueño de la cuenta corriente que se prepara.
 */
const PASSENGER_ACCOUNT_SQL = `SELECT ID FROM PASSENGERACCOUNT
WHERE PASSENGER_ID = :passengerId AND CARRIERACCOUNT_ID = :carrierId AND ID = :passengerAccountId`;

const CC_BY_ID_SQL = `SELECT ID, BALANCE, CREDITSUM, DEBITSUM, CHECKINGACCOUNTLIMIT, EXCEEDINGLIMIT, THRESHOLD_PCT,
BLOCK_WHEN_EXCEEDED FROM CHECKINGACCOUNT WHERE ID = :id`;

interface CcRow {
	ID: number;
	PASSENGERACCOUNT_ID?: number;
	CURRENCY_ID?: number;
	BALANCE: number;
	CREDITSUM: number;
	DEBITSUM: number;
	CHECKINGACCOUNTLIMIT: number;
	EXCEEDINGLIMIT: number;
	THRESHOLD_PCT?: number | null;
	BLOCK_WHEN_EXCEEDED?: number | null;
}

interface RestoreState {
	carrierId: number;
	contractorId: number;
	checkingAccountId: number;
	original: { limit: number; exceedingLimit: boolean; balance: number; snapshot: CcRow };
}

interface Row {
	label: string;
	/** Slug explícito y único del archivo de evidencia (`+`/`−` no sobreviven a una sanitización genérica). */
	slug: string;
	/** Saldo disponible deseado como función del importe `I` del viaje. */
	saldo: (importe: number) => number;
	expected: ExceedingLimitStatus;
}

const ROWS: Row[] = [
	{ label: 'saldo = I + 0,01', slug: 'fila-1-I-mas-0_01', saldo: (i) => i + 0.01, expected: 'NOT_EXCEEDED' },
	{ label: 'saldo = I − 0,01', slug: 'fila-2-I-menos-0_01', saldo: (i) => i - 0.01, expected: 'NOT_EXCEEDED' },
	// «saldo ≤ 0» del Gherkin: se ejercen el borde (= 0) y un valor interior (−0,01) para separar la regla del borde.
	{ label: 'saldo = 0 (borde de saldo ≤ 0)', slug: 'fila-3-saldo-0-borde', saldo: () => 0, expected: 'EXCEEDED' },
	{ label: 'saldo = −0,01 (saldo ≤ 0)', slug: 'fila-4-saldo-menos-0_01', saldo: () => -0.01, expected: 'EXCEEDED' }
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Minuto UTC dentro de la ventana del job de saldo (`CC_BALANCE_JOB_WINDOW`, default 40-50, `off` = sin ventana). */
function inBalanceJobWindow(now: Date = new Date()): boolean {
	const raw = (process.env.CC_BALANCE_JOB_WINDOW ?? '40-50').trim();
	if (raw === 'off') return false;
	const [from, to] = raw.split('-').map(Number);
	if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
	const minute = now.getUTCMinutes();
	return minute >= from && minute < to;
}

test.describe('MG-1004: checkExceedingLimit según saldo y límite de la cuenta corriente USD (contrato-api)', () => {
	let restore: RestoreState | null = null;

	test.beforeEach(({ cfg }) => {
		test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
		test.skip(
			process.env.ALLOW_MUTATIONS !== '1' || cfg.env === 'prod',
			'Mutación: exige ALLOW_MUTATIONS=1 y nunca prod.'
		);
		test.skip(
			inBalanceJobWindow(),
			'Ventana del job de saldo de cuenta corriente (CC_BALANCE_JOB_WINDOW, minuto UTC 40-49): se reintenta fuera de ella.'
		);
	});

	// Restauración SIEMPRE: aun si el test falló o saltó después de cambiar el límite.
	test.afterEach(async ({ db, contractorAccount }) => {
		if (!restore) return;
		const state = restore;
		restore = null;
		const { original, checkingAccountId, carrierId, contractorId } = state;
		const hint = `REPONER A MANO la cuenta corriente ${checkingAccountId} (cliente ${contractorId}, carrier ${carrierId}): checkingAccountLimit=${original.limit}, exceedingLimit=${original.exceedingLimit}`;
		try {
			const current = (await db!.query<CcRow>(CC_BY_ID_SQL, { id: checkingAccountId }))[0];
			if (
				current.CHECKINGACCOUNTLIMIT !== original.limit ||
				(current.EXCEEDINGLIMIT === 1) !== original.exceedingLimit
			) {
				const contractor = await contractorAccount.getContractor(carrierId, contractorId);
				expect(contractor, 'ficha del cliente para restaurar el límite').not.toBeNull();
				await pace();
				await contractorAccount.setCheckingAccountLimit(carrierId, {
					contractor: contractor!,
					checkingAccountId,
					limit: original.limit,
					exceedingLimit: original.exceedingLimit
				});
			}
			let restored: CcRow | undefined;
			await expect
				.poll(
					async () => {
						restored = (await db!.query<CcRow>(CC_BY_ID_SQL, { id: checkingAccountId }))[0];
						return { limit: restored.CHECKINGACCOUNTLIMIT, exceedingLimit: restored.EXCEEDINGLIMIT === 1 };
					},
					{ message: 'límite y «Permite exceder» restaurados a los valores originales', timeout: 20_000 }
				)
				.toEqual({ limit: original.limit, exceedingLimit: original.exceedingLimit });
			await observe(`TM-1394-restore-${checkingAccountId}`, {
				endpoint: 'POST carrier/{carrierId}/updateCompany (restauración) + SELECT CHECKINGACCOUNT',
				variation: { original },
				status: 200,
				response: { afterRestore: restored }
			});
		} catch (err) {
			throw new Error(`${hint}\nCausa: ${(err as Error).message}`);
		}
	});

	for (const row of ROWS) {
		test(
			`TM-1394: should answer ${row.expected} from checkExceedingLimit when ${row.label} and «Permite exceder» is off`,
			{ annotation: { type: 'tms_only', description: 'TM-1394' } },
			async ({ travels, db, cfg, contractorAccount }) => {
				test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): precondición y pata DB no verificables.');
				const carrierId = cfg.carrierId;
				const employee = await discoverEmployee(db!, F2_EMPLOYEES.d3);
				test.skip(!employee, 'No se encontró el empleado «ConCC, QA Colab» del cliente D3 Bimonetario (1761).');
				const usd = await resolveBaseline(db!, BASELINE_TRAVELS.sale6204);
				test.skip(!usd, 'Sin baseline vivo: no se pudo resolver la moneda USD del carrier.');
				const contractorId = employee!.contractorAccountId;

				// Discover [DB]: la cuenta corriente USD del cliente de QA. Si no existe, se DETIENE este test (no se elige otro cliente).
				const accounts = await db!.query<CcRow>(CC_SQL, { contractorId, carrierId, currencyId: usd!.currencyId });
				test.skip(
					accounts.length !== 1,
					`El cliente ${contractorId} no tiene exactamente una cuenta corriente en la moneda ${usd!.currencyId} (hay ${accounts.length}): no se toca ningún otro cliente.`
				);
				const account = accounts[0];

				// Precondición [DB]: el sujeto de `checkExceedingLimit` es el SOLICITANTE (`requesterUserId`) del cliente, dueño
				// de la PASSENGERACCOUNT de la cuenta corriente. El empleado (`employeeId`) es OTRO pasajero, sin cuenta en el
				// carrier: con él el backend responde NOT_EXCEEDED sin evaluar saldo (falso verde). Falla fuerte, no se saltea.
				const passengerAccounts = await db!.query<{ ID: number }>(PASSENGER_ACCOUNT_SQL, {
					passengerId: employee!.requesterUserId,
					carrierId,
					passengerAccountId: account.PASSENGERACCOUNT_ID
				});
				expect(
					passengerAccounts,
					`PASSENGERACCOUNT ${account.PASSENGERACCOUNT_ID} debe pertenecer al solicitante ${employee!.requesterUserId} en el carrier ${carrierId} (exactamente 1 fila)`
				).toHaveLength(1);

				const contractor = await contractorAccount.getContractor(carrierId, contractorId);
				expect(contractor, `ficha del cliente ${contractorId}`).not.toBeNull();
				expect(
					contractor!.checkingAccounts?.some((a) => a.checkingAccountId === account.ID),
					`la cuenta ${account.ID} debe figurar en la ficha del cliente`
				).toBe(true);

				// `I`: importe de venta de simulateAll en vivo del mismo empleado.
				await pace();
				const quoteRes = await travels.requestSimulation(carrierId, {
					endpoint: 'simulateAll',
					body: buildSimulateBody(employee!, { note: F2_NOTES.limit })
				});
				expect(quoteRes.status(), 'simulateAll para obtener el importe I').toBe(200);
				const quote = pickByVehicle((await quoteRes.json()) as SimulationBreakdown[], VEHICLE_TYPE_ID);
				expect(quote?.pricePointToPoint, 'simulateAll debe traer el importe de venta I').toBeGreaterThan(0);
				const importe = quote!.pricePointToPoint!;

				const snapshot = (await db!.query<CcRow>(CC_BY_ID_SQL, { id: account.ID }))[0];
				const original = {
					limit: account.CHECKINGACCOUNTLIMIT,
					exceedingLimit: account.EXCEEDINGLIMIT === 1,
					balance: account.BALANCE,
					snapshot
				};
				test.info().annotations.push({
					type: 'cc-original',
					description: `cuenta ${account.ID}: limit=${original.limit}, exceedingLimit=${original.exceedingLimit}, balance=${original.balance}, thresholdPct=${String(snapshot.THRESHOLD_PCT)}, blockWhenExceeded=${String(snapshot.BLOCK_WHEN_EXCEEDED)}`
				});
				const saldo = round2(row.saldo(importe));
				const limit = round2(account.DEBITSUM - account.CREDITSUM + saldo);

				// A partir de acá hay algo que restaurar (aun si el update falla a mitad).
				restore = { carrierId, contractorId, checkingAccountId: account.ID, original };
				await pace();
				await contractorAccount.setCheckingAccountLimit(carrierId, {
					contractor: contractor!,
					checkingAccountId: account.ID,
					limit,
					exceedingLimit: false
				});

				// Espera por condición observable en DB: el límite aplicado y el saldo derivado.
				let prepared: CcRow | undefined;
				await expect
					.poll(
						async () => {
							prepared = (await db!.query<CcRow>(CC_BY_ID_SQL, { id: account.ID }))[0];
							return {
								limit: prepared.CHECKINGACCOUNTLIMIT,
								exceedingLimit: prepared.EXCEEDINGLIMIT === 1,
								saldoOk: Math.abs(prepared.BALANCE - saldo) < 0.011
							};
						},
						{ message: `límite ${limit} aplicado y saldo derivado ≈ ${saldo}`, timeout: 30_000 }
					)
					.toEqual({ limit, exceedingLimit: false, saldoOk: true });

				await pace();
				const status = await travels.checkExceedingLimit(carrierId, { passengerId: employee!.requesterUserId });
				await observe(`TM-1394-${row.slug}`, {
					endpoint: `GET carriers/${carrierId}/travels/passenger/${employee!.requesterUserId}/checkExceedingLimit/CHECKING_ACCOUNT/Web`,
					variation: {
						importeI: importe,
						saldoDeseado: saldo,
						limitAplicado: limit,
						exceedingLimit: false,
						passengerAccountId: account.PASSENGERACCOUNT_ID
					},
					status: 200,
					response: { checkExceedingLimit: status, cuentaOriginal: original, cuentaPreparada: prepared }
				});
				expect(status, `checkExceedingLimit con ${row.label} (I = ${importe}, saldo = ${saldo})`).toBe(row.expected);
			}
		);
	}
});
