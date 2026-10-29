// tests/specs/controllers/mg1004-currency-contract.api.test.ts
// MG-1004 (Moneda, árbol del tarifador y cálculo en el alta) — contrato de API del ATP TM-1285, label
// `contrato-api` (decisión QA lead 19/10/2026: sin camino de pantalla, se prueba por API).
//
// Runs target ENV=test (carrier 1521): los tarifadores 6202/6204 y el cliente Alpine F1 Team (1522) solo
// existen en TEST; decisión QA lead 19/10 (contrato-api). Con otro ENV los tests se saltean con motivo.
//
// PLAN (escenario <-> key Xray <-> oráculo)
//   TM-1423  simulateAll del request real de Krief (único tarifador 6204 en USD) con currencyId = moneda que
//            factura el 6202 (ARS) -> 409 RATE_WITHOUT_CURRENCY y «There is no rate for the ARS currency.»;
//            sin lista parcial; TRAVEL con la Nota del caso sin cambios.
//   TM-1390  mismo request real con currencyId = 99999 / «abc» sobre simulate, simulateAll y create ->
//            oráculo CONSERVADOR del Gherkin (Dev 20/10/2026: no hay camino de pantalla): nunca 5xx, un 4xx,
//            TRAVEL con Nota «QA F2F3 T18-INV» sin cambio. El status/errorCode exactos son «comportamiento
//            observado» (se adjuntan como red-*.json), no criterio. Los `create` exigen ALLOW_MUTATIONS=1 y
//            no prod (no se espera que escriban; si respondieran 2xx el ATC cancela el viaje).
//   Fila «sin currencyId» del Gherkin: BLOQUEADA por modelo (no existe pasajero con único tarifador en otra
//   moneda): fuera de este spec.
//   --- PK-A (21/10/2026), solo lectura, Krief (6204, USD, por venta); importes SIEMPRE leídos en vivo de los viajes
//   de referencia 71305/71082 (`data/f2/baseline.ts`), nunca literales del Gherkin ---
//   TM-1367  simulate y simulateAll sin la clave currencyId -> 200, moneda del carrier (USD, id del baseline),
//            carrierRateByCost=false, tarifador y importes del baseline. Cobertura PARCIAL: acredita la partición de
//            contrato por API; las filas de UI y de app Pasajero del Gherkin siguen siendo manuales. El create sin
//            currencyId vive en `_mutation/mg1004-create-currency-resolution.mutation.api.test.ts`.
//   TM-1424  simulateAll con currencyId = null y = moneda del carrier -> 200 e idéntico al request sin el campo
//            (control dentro del mismo test). La variante D4/6203 (tarifador predeterminado) queda fuera.
//   TM-1426  simulate devuelve el mismo desglose que simulateAll (emparejado por transportTypeId) y los cuatro campos
//            de costo nuevos en 0, no ausentes; y simulate con moneda sin tarifador -> 409 RATE_WITHOUT_CURRENCY.
//            Las filas 6203 (costo y venta) y 6202 (bimonetario) se difieren a F7 (costo no habilitado en PROD).
//
// Crédito: cada test declara `tms_only` para acreditar SOLO su key (los ATCs de TravelsApi corren también
// en otros specs). El oráculo de DB lee en vivo (CARRIERRATE, CONTRACTOR_CARRIERRATES, TRAVEL).

import { test, expect } from '@TestBase';
import {
	F2_EMPLOYEES,
	F2_NOTES,
	F2_TEST_ONLY_REASON,
	buildCreateBody,
	buildSimulateBody,
	discoverEmployee,
	isF2Env
} from '@data/f2';
import { observe, responseBody } from '@data/f2/observe';
import { pace } from '@data/f2/pace';
import { BASELINE_TRAVELS, resolveBaseline } from '@data/f2/baseline';
import { assertAgainstBaseline, assertSameBreakdown, forEvidence, pickByVehicle } from '@data/f2/simulation';
import type { F2Employee } from '@data/f2';
import type { OracleDb } from '@db/OracleDb';
import type { SimulationBreakdown, TravelRequestEndpoint } from '@api/TravelsApi';

const ARS_RATE_NAME = 'QA F2 Bimonetario ARS';
const NOTE_COUNT_SQL = `SELECT COUNT(*) AS N FROM TRAVEL WHERE CARRIERACCOUNT_ID = :carrierId AND NOTE LIKE :note`;

interface CountRow {
	N: number;
}

test.describe('MG-1004: contrato de moneda en simulate / simulateAll / create (contrato-api)', () => {
	test(
		'TM-1423: should reject simulateAll with 409 RATE_WITHOUT_CURRENCY when the currency belongs only to another rate of the carrier',
		{ annotation: { type: 'tms_only', description: 'TM-1423' } },
		async ({ travels, db, cfg }) => {
			test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
			test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): precondición y pata DB no verificables.');
			const carrierId = cfg.carrierId;
			const employee = await discoverEmployee(db!, F2_EMPLOYEES.krief);
			test.skip(!employee, 'No se encontró el empleado «Krief, Philippe» del cliente Alpine F1 Team.');

			// Precondición [DB]: el carrier tiene un tarifador que factura en otra moneda (ARS) y el cliente de
			// Krief solo tiene asignados tarifadores que NO facturan en esa moneda.
			const ars = await db!.query<{ ID: number; INVOICE_CURRENCY_ID: number }>(
				'SELECT ID, INVOICE_CURRENCY_ID FROM CARRIERRATE WHERE NAME = :name AND CARRIERACCOUNT_ID = :carrierId',
				{ name: ARS_RATE_NAME, carrierId }
			);
			expect(
				ars,
				`precondición: debe existir un único tarifador «${ARS_RATE_NAME}» en el carrier ${carrierId}`
			).toHaveLength(1);
			const arsCurrencyId = ars[0].INVOICE_CURRENCY_ID;
			const treeCurrencies = await db!.query<{ INVOICE_CURRENCY_ID: number }>(
				`SELECT DISTINCT r.INVOICE_CURRENCY_ID FROM CONTRACTOR_CARRIERRATES c JOIN CARRIERRATE r ON r.ID = c.CARRIERRATE_ID
				 WHERE c.CONTRACTORACCOUNT_ID = :contractorId`,
				{ contractorId: employee!.contractorAccountId }
			);
			expect(
				treeCurrencies.map((r) => r.INVOICE_CURRENCY_ID),
				`precondición: el árbol del cliente ${employee!.contractorAccountId} no debe facturar en la moneda ${arsCurrencyId}`
			).not.toContain(arsCurrencyId);

			const note = F2_NOTES.currencyWithoutRate;
			const before = (await db!.query<CountRow>(NOTE_COUNT_SQL, { carrierId, note: `%${note}%` }))[0].N;

			const body = buildSimulateBody(employee!, { note, currencyId: arsCurrencyId });
			await pace();
			const res = await travels.simulateAllRejectsCurrencyWithoutRate(carrierId, body);
			const json = (await responseBody(res)) as { errorCode?: string; description?: string };
			await observe('TM-1423-simulateAll-409', {
				endpoint: `POST carriers/${carrierId}/travels/simulateAll`,
				variation: { currencyId: arsCurrencyId },
				sentBody: body,
				status: res.status(),
				response: json
			});

			expect(json.description, 'mensaje del 409').toBe('There is no rate for the ARS currency.');
			expect(Array.isArray(json), 'no debe devolver una lista parcial de tarifas').toBe(false);
			const after = (await db!.query<CountRow>(NOTE_COUNT_SQL, { carrierId, note: `%${note}%` }))[0].N;
			expect(after, 'no debe crearse ninguna fila de TRAVEL con la Nota del caso').toBe(before);
		}
	);

	const variants: Array<{ label: string; currencyId: unknown }> = [
		{ label: 'currencyId-99999', currencyId: 99999 },
		{ label: 'currencyId-abc', currencyId: 'abc' }
	];
	const endpoints: TravelRequestEndpoint[] = ['simulate', 'simulateAll', 'create'];

	for (const variant of variants) {
		for (const endpoint of endpoints) {
			test(
				`TM-1390: should answer a controlled 4xx and never a 5xx when ${endpoint} sends ${variant.label}`,
				{ annotation: { type: 'tms_only', description: 'TM-1390' } },
				async ({ travels, db, cfg }) => {
					test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
					test.skip(
						!db,
						'Sin credenciales Oracle (ORACLE_*_TEST): descubrimiento del empleado y pata DB no verificables.'
					);
					if (endpoint === 'create') {
						test.skip(
							process.env.ALLOW_MUTATIONS !== '1' || cfg.env === 'prod',
							'create exige ALLOW_MUTATIONS=1 y nunca prod (doble guarda de mutaciones).'
						);
					}
					const carrierId = cfg.carrierId;
					const employee = await discoverEmployee(db!, F2_EMPLOYEES.krief);
					test.skip(!employee, 'No se encontró el empleado «Krief, Philippe» del cliente Alpine F1 Team.');

					const note = F2_NOTES.currencyInvalid;
					const before = (await db!.query<CountRow>(NOTE_COUNT_SQL, { carrierId, note: `%${note}%` }))[0].N;

					const base =
						endpoint === 'create' ? buildCreateBody(employee!, { note }) : buildSimulateBody(employee!, { note });
					await pace();
					const res = await travels.sendTravelWithRawCurrencyId(carrierId, {
						endpoint,
						body: base,
						currencyId: variant.currencyId
					});
					await observe(`TM-1390-${endpoint}-${variant.label}`, {
						endpoint: `POST carriers/${carrierId}/travels${endpoint === 'create' ? '' : `/${endpoint}`}`,
						variation: { currencyId: variant.currencyId },
						sentBody: { ...base, currencyId: variant.currencyId },
						status: res.status(),
						response: await responseBody(res)
					});

					const after = (await db!.query<CountRow>(NOTE_COUNT_SQL, { carrierId, note: `%${note}%` }))[0].N;
					expect(after, 'la cantidad de filas de TRAVEL con la Nota del caso debe seguir igual').toBe(before);
				}
			);
		}
	}
});

/** Tipo de vehículo del request real de V2 (`vehicleTypeId`): `simulateAll` lo empareja por `transportTypeId`. */
const VEHICLE_TYPE_ID = 1;

/** Discover (precondición): Krief y el baseline vivo de 6204; saltea con motivo si falta alguno. */
async function prepareKrief(
	db: OracleDb
): Promise<{ employee: F2Employee; base: NonNullable<Awaited<ReturnType<typeof resolveBaseline>>> }> {
	const employee = await discoverEmployee(db, F2_EMPLOYEES.krief);
	test.skip(!employee, 'No se encontró el empleado «Krief, Philippe» del cliente Alpine F1 Team.');
	const base = await resolveBaseline(db, BASELINE_TRAVELS.sale6204);
	test.skip(
		!base,
		'Viajes de referencia 71305/71082 ausentes o discrepantes: no hay baseline vivo del tarifador 6204.'
	);
	return { employee: employee!, base: base! };
}

test.describe('MG-1004 PK-A: alta y cotización con una sola moneda, solo lectura (contrato-api)', () => {
	test.beforeEach(({ db }) => {
		test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
		test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): precondición y baseline vivo no verificables.');
	});

	test(
		'TM-1367: should quote simulate without currencyId with the carrier currency and the baseline amounts',
		{ annotation: { type: 'tms_only', description: 'TM-1367' } },
		async ({ travels, db, cfg }) => {
			const carrierId = cfg.carrierId;
			const { employee, base } = await prepareKrief(db!);
			const body = buildSimulateBody(employee, { note: F2_NOTES.defaultCurrency });
			expect(Object.keys(body), 'el request no debe llevar la clave currencyId').not.toContain('currencyId');

			await pace();
			const res = await travels.sendTravelWithCarrierCurrency(carrierId, {
				endpoint: 'simulate',
				body,
				currencyId: 'omit'
			});
			const json = (await res.json()) as SimulationBreakdown;
			await observe('TM-1367-simulate-sin-currencyId', {
				endpoint: `POST carriers/${carrierId}/travels/simulate`,
				variation: { currencyId: '(clave omitida)' },
				sentBody: body,
				status: res.status(),
				response: forEvidence(json)
			});
			assertAgainstBaseline('simulate', json, base, 'USD');
		}
	);

	test(
		'TM-1367: should quote simulateAll without currencyId with the carrier currency and the baseline amounts',
		{ annotation: { type: 'tms_only', description: 'TM-1367' } },
		async ({ travels, db, cfg }) => {
			const carrierId = cfg.carrierId;
			const { employee, base } = await prepareKrief(db!);
			const body = buildSimulateBody(employee, { note: F2_NOTES.defaultCurrency });
			expect(Object.keys(body), 'el request no debe llevar la clave currencyId').not.toContain('currencyId');

			await pace();
			const res = await travels.sendTravelWithCarrierCurrency(carrierId, {
				endpoint: 'simulateAll',
				body,
				currencyId: 'omit'
			});
			const list = (await res.json()) as SimulationBreakdown[];
			await observe('TM-1367-simulateAll-sin-currencyId', {
				endpoint: `POST carriers/${carrierId}/travels/simulateAll`,
				variation: { currencyId: '(clave omitida)' },
				sentBody: body,
				status: res.status(),
				response: forEvidence(list)
			});
			const paired = pickByVehicle(list, VEHICLE_TYPE_ID);
			expect(paired, `simulateAll debe traer el tipo de vehículo ${VEHICLE_TYPE_ID}`).toBeDefined();
			assertAgainstBaseline('simulateAll', paired!, base, 'USD');
		}
	);

	for (const variant of ['null', 'moneda del carrier'] as const) {
		test(
			`TM-1424: should answer simulateAll with currencyId ${variant} exactly as the request without the field`,
			{ annotation: { type: 'tms_only', description: 'TM-1424' } },
			async ({ travels, db, cfg }) => {
				const carrierId = cfg.carrierId;
				const { employee, base } = await prepareKrief(db!);
				const currencyId = variant === 'null' ? null : base.currencyId;
				const body = buildSimulateBody(employee, { note: F2_NOTES.explicitCurrency });

				// Control: el mismo request sin la clave (acción de soporte; el ATC bajo prueba es la variante).
				await pace();
				const controlRes = await travels.requestSimulation(carrierId, { endpoint: 'simulateAll', body });
				expect(controlRes.status(), 'control simulateAll sin currencyId').toBe(200);
				const control = pickByVehicle((await controlRes.json()) as SimulationBreakdown[], VEHICLE_TYPE_ID);
				expect(control, 'control: tipo de vehículo del request').toBeDefined();

				await pace();
				const res = await travels.sendTravelWithCarrierCurrency(carrierId, {
					endpoint: 'simulateAll',
					body,
					currencyId
				});
				const list = (await res.json()) as SimulationBreakdown[];
				await observe(`TM-1424-simulateAll-${currencyId === null ? 'null' : `id${currencyId}`}`, {
					endpoint: `POST carriers/${carrierId}/travels/simulateAll`,
					variation: { currencyId },
					sentBody: { ...body, currencyId },
					status: res.status(),
					response: { control: forEvidence(control), variant: forEvidence(list) }
				});
				const got = pickByVehicle(list, VEHICLE_TYPE_ID);
				expect(got, 'variante: tipo de vehículo del request').toBeDefined();
				assertSameBreakdown(`currencyId ${variant}`, got!, control!);
				assertAgainstBaseline(`currencyId ${variant}`, got!, base, 'USD');
			}
		);
	}

	test(
		'TM-1426: should return the same breakdown from simulate as from simulateAll and the four cost fields informed in 0',
		{ annotation: { type: 'tms_only', description: 'TM-1426' } },
		async ({ travels, db, cfg }) => {
			const carrierId = cfg.carrierId;
			const { employee, base } = await prepareKrief(db!);
			const note = F2_NOTES.simulateParity;
			const before = (await db!.query<CountRow>(NOTE_COUNT_SQL, { carrierId, note: `%${note}%` }))[0].N;
			const body = buildSimulateBody(employee, { note });

			await pace();
			const parity = await travels.simulateReturnsSameBreakdownAsSimulateAll(carrierId, body);
			await observe('TM-1426-paridad-simulate-simulateAll', {
				endpoint: `POST carriers/${carrierId}/travels/simulate + simulateAll`,
				variation: null,
				sentBody: body,
				status: 200,
				response: { simulate: forEvidence(parity.simulate), simulateAllPaired: forEvidence(parity.paired) }
			});
			assertAgainstBaseline('simulate', parity.simulate, base, 'USD');
			const after = (await db!.query<CountRow>(NOTE_COUNT_SQL, { carrierId, note: `%${note}%` }))[0].N;
			expect(after, 'simulate/simulateAll no deben crear filas de TRAVEL con la Nota del caso').toBe(before);
		}
	);

	test(
		'TM-1426: should reject simulate with 409 RATE_WITHOUT_CURRENCY when the currency belongs only to another rate of the carrier',
		{ annotation: { type: 'tms_only', description: 'TM-1426' } },
		async ({ travels, db, cfg }) => {
			const carrierId = cfg.carrierId;
			const { employee } = await prepareKrief(db!);

			// Precondición [DB]: moneda de otro tarifador del carrier (ARS) que el árbol del cliente de Krief no factura.
			const ars = await db!.query<{ INVOICE_CURRENCY_ID: number }>(
				'SELECT INVOICE_CURRENCY_ID FROM CARRIERRATE WHERE NAME = :name AND CARRIERACCOUNT_ID = :carrierId',
				{ name: ARS_RATE_NAME, carrierId }
			);
			expect(
				ars,
				`precondición: debe existir un único tarifador «${ARS_RATE_NAME}» en el carrier ${carrierId}`
			).toHaveLength(1);
			const arsCurrencyId = ars[0].INVOICE_CURRENCY_ID;
			const tree = await db!.query<{ INVOICE_CURRENCY_ID: number }>(
				`SELECT DISTINCT r.INVOICE_CURRENCY_ID FROM CONTRACTOR_CARRIERRATES c JOIN CARRIERRATE r ON r.ID = c.CARRIERRATE_ID
				 WHERE c.CONTRACTORACCOUNT_ID = :contractorId`,
				{ contractorId: employee.contractorAccountId }
			);
			expect(
				tree.map((r) => r.INVOICE_CURRENCY_ID),
				`precondición: el árbol del cliente ${employee.contractorAccountId} no debe facturar en la moneda ${arsCurrencyId}`
			).not.toContain(arsCurrencyId);

			const body = buildSimulateBody(employee, { note: F2_NOTES.simulateParity, currencyId: arsCurrencyId });
			await pace();
			const res = await travels.simulateRejectsCurrencyWithoutRate(carrierId, body);
			await observe('TM-1426-simulate-409', {
				endpoint: `POST carriers/${carrierId}/travels/simulate`,
				variation: { currencyId: arsCurrencyId },
				sentBody: body,
				status: res.status(),
				response: await responseBody(res)
			});
		}
	);
});
