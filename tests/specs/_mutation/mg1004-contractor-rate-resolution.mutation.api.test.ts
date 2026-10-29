// tests/specs/_mutation/mg1004-contractor-rate-resolution.mutation.api.test.ts
// MG-1004 — contrato de API del ATP TM-1285, label `contrato-api` (decisión QA lead 19/10/2026): el alta de un
// empleado de contractor resuelve el tarifador PERSONALIZED del contractor. PK-A (21/10/2026), plan
// docs/plans/PK-A-contrato-api-alta-*.md.
//
// Runs target ENV=test (carrier 1521): el contractor «McLaren Racing Limited» (1521), su tarifador 6203 y los
// empleados «QA Fdos Empleado ConCC» y «Zak Brown» solo existen en TEST; decisión QA lead 19/10.
//
// PLAN (escenario <-> key Xray <-> oráculo)
//   Fila A  colaborador sin PASSENGERACCOUNT propio (hereda del contractor): acredita [TM-1395][TM-1431].
//           Precondición [DB]: sin PASSENGERACCOUNT propio, el contractor tiene el tarifador del baseline y está vinculado a
//           UN solo carrier (TM-1431). simulate y simulateAll -> 200 con los importes del baseline; create -> 200 + travelId;
//           DB: CARRIERRATE_ID = tarifador del baseline (6203, por costo), CARRIERRATE_BY_COST = 1,
//           PRICEPOINTTOPOINT_COST distinto de PRICEPOINTTOPOINT, importes = baseline, y el COUNT de
//           CONTRACTOR_CARRIERRATES del contractor SIN cambio (TM-1431: «ninguna fila nueva»).
//   Fila B  contractor con registro propio («Zak Brown»): acredita [TM-1395]; importes de SIMULATIONPRICEI = baseline.
//   Baseline = viajes de referencia 71200/71320 leídos EN VIVO (`data/f2/baseline.ts`); nada de literales del Gherkin.
//   Este par es de tarifador por costo (6203) pero lo que se asierta es la RESOLUCIÓN de la tarifa y que los importes
//   no cambian; no hay aserciones de comisión ni de costo más allá de las del Gherkin (decisión QA 21/10: queda en PK-A).
//
// GUARDAS: doble (ALLOW_MUTATIONS=1 y nunca prod); crea 2 viajes, sin chofer ni autodispatch.
// CLEANUP: cada viaje se cancela en afterEach con `travels.cancelTravel` y se verifica por DB (STATE 7).
//
// Crédito: `tms_only` (varias en la fila A: el reporter acredita las dos keys con un solo test).

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
import type { F2EmployeeName } from '@data/f2';
import { BASELINE_TRAVELS, resolveBaseline } from '@data/f2/baseline';
import { cancelAndVerify } from '@data/f2/cancel';
import type { TravelToCancel } from '@data/f2/cancel';
import { observe, responseBody } from '@data/f2/observe';
import { pace } from '@data/f2/pace';
import { assertAgainstBaseline, forEvidence, pickByVehicle } from '@data/f2/simulation';
import type { SimulationBreakdown } from '@api/TravelsApi';

const VEHICLE_TYPE_ID = 1;

const TRAVEL_SQL = `SELECT t.ID, t.STATE, t.DRIVER_ID, t.CURRENCY_ID, s.CARRIERRATE_ID, s.CARRIERRATE_BY_COST,
s.PRICEPOINTTOPOINT, s.PRICEPOINTTOPOINT_COST
FROM TRAVEL t JOIN SIMULATIONPRICEI s ON s.ID = t.SIMULATIONPRICE_ID WHERE t.ID = :id`;

interface TravelRow {
	ID: number;
	STATE: number;
	DRIVER_ID: number | null;
	CURRENCY_ID: number;
	CARRIERRATE_ID: number;
	CARRIERRATE_BY_COST: number;
	PRICEPOINTTOPOINT: number;
	PRICEPOINTTOPOINT_COST: number;
}

interface CountRow {
	N: number;
}

interface Row {
	/** Etiqueta del test y de la evidencia. */
	label: string;
	who: F2EmployeeName;
	/** Keys acreditadas por el test (varias `tms_only`). */
	keys: string[];
	noteSuffix: string;
	/** Fila A: precondiciones de herencia, simulate/simulateAll y COUNT de CONTRACTOR_CARRIERRATES. */
	inherits: boolean;
}

const ROWS: Row[] = [
	{
		label: 'colaborador sin cuenta propia',
		who: F2_EMPLOYEES.mclarenColab,
		keys: ['TM-1395', 'TM-1431'],
		noteSuffix: '',
		inherits: true
	},
	{
		label: 'contractor con registro propio',
		who: F2_EMPLOYEES.mclarenOwn,
		keys: ['TM-1395'],
		noteSuffix: '-C',
		inherits: false
	}
];

const COUNT_RATES_SQL = 'SELECT COUNT(*) AS N FROM CONTRACTOR_CARRIERRATES WHERE CONTRACTORACCOUNT_ID = :contractorId';

test.describe('MG-1004: el alta del empleado usa el tarifador personalizado del contractor (contrato-api)', () => {
	let travelToCancel: TravelToCancel | null = null;

	test.beforeEach(({ cfg }) => {
		test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
		test.skip(
			process.env.ALLOW_MUTATIONS !== '1' || cfg.env === 'prod',
			'Mutación: exige ALLOW_MUTATIONS=1 y nunca prod.'
		);
	});

	test.afterEach(async ({ travels, db }) => {
		if (!travelToCancel) return;
		const trip = travelToCancel;
		travelToCancel = null;
		await cancelAndVerify(travels, db, trip);
	});

	for (const row of ROWS) {
		test(
			`${row.keys.join('+')}: should resolve the contractor personalized rate on create for ${row.label}`,
			{ annotation: row.keys.map((key) => ({ type: 'tms_only', description: key })) },
			async ({ travels, db, cfg }) => {
				test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): la pata DB no es verificable.');
				const carrierId = cfg.carrierId;
				const employee = await discoverEmployee(db!, row.who);
				test.skip(!employee, `No se encontró el empleado «${row.who.lastName}, ${row.who.firstName}» de McLaren.`);
				const base = await resolveBaseline(db!, BASELINE_TRAVELS.costSale6203);
				test.skip(!base, 'Viajes de referencia 71200/71320 ausentes o discrepantes: no hay baseline vivo de 6203.');
				const contractorId = employee!.contractorAccountId;

				// Precondiciones [DB].
				const hasRate = await db!.query<CountRow>(`${COUNT_RATES_SQL} AND CARRIERRATE_ID = :rateId`, {
					contractorId,
					rateId: base!.carrierRateId
				});
				expect(
					hasRate[0].N,
					`precondición: el contractor ${contractorId} tiene el tarifador ${base!.carrierRateId}`
				).toBe(1);
				if (row.inherits) {
					const own = await db!.query<CountRow>(
						'SELECT COUNT(*) AS N FROM PASSENGERACCOUNT WHERE PASSENGER_ID = :id AND CARRIERACCOUNT_ID = :carrierId',
						{ id: employee!.employeeId, carrierId }
					);
					expect(
						own[0].N,
						'precondición: el colaborador no tiene PASSENGERACCOUNT propio (hereda del contractor)'
					).toBe(0);
					const carriers = await db!.query<CountRow>(
						'SELECT COUNT(DISTINCT CARRIER_ACCOUNT) AS N FROM CAR_CON_RELATION WHERE CONTRACTOR_ACCOUNT = :contractorId',
						{ contractorId }
					);
					expect(carriers[0].N, 'precondición (TM-1431): el contractor está vinculado a un solo carrier').toBe(1);
				}
				const ratesBefore = (await db!.query<CountRow>(COUNT_RATES_SQL, { contractorId }))[0].N;

				const note = `${F2_NOTES.contractorRate}${row.noteSuffix} ${Date.now().toString(36)}`;
				if (row.inherits) {
					const sim = buildSimulateBody(employee!, { note });
					for (const endpoint of ['simulate', 'simulateAll'] as const) {
						await pace();
						const res = await travels.requestSimulation(carrierId, { endpoint, body: sim });
						expect(res.status(), `${endpoint} del colaborador`).toBe(200);
						const json = (await res.json()) as SimulationBreakdown | SimulationBreakdown[];
						const one = Array.isArray(json) ? pickByVehicle(json, VEHICLE_TYPE_ID) : json;
						expect(one, `${endpoint}: tipo de vehículo del request`).toBeDefined();
						await observe(`${row.keys.join('-')}-${endpoint}`, {
							endpoint: `POST carriers/${carrierId}/travels/${endpoint}`,
							variation: null,
							sentBody: sim,
							status: res.status(),
							response: forEvidence(one)
						});
						assertAgainstBaseline(endpoint, one!, base!, 'USD');
					}
				}

				const body = buildCreateBody(employee!, { note });
				await pace();
				const res = await travels.createResolvingContractorRate(carrierId, {
					body,
					onCreated: (travelId) => {
						travelToCancel = { carrierId, travelId, label: `${row.keys.join('+')} ${row.label}` };
					}
				});
				const created = (await res.json()) as { travelId: number };
				test.info().annotations.push({
					type: 'travel-created',
					description: `carrier ${carrierId} · travelId ${created.travelId}`
				});
				await observe(`${row.keys.join('-')}-create`, {
					endpoint: `POST carriers/${carrierId}/travels`,
					variation: null,
					sentBody: body,
					status: res.status(),
					response: { travelId: created.travelId, ...((await responseBody(res)) as object) }
				});

				const rows = await db!.query<TravelRow>(TRAVEL_SQL, { id: created.travelId });
				expect(rows, 'el viaje creado debe existir con su simulación').toHaveLength(1);
				const travel = rows[0];
				const ratesAfter = (await db!.query<CountRow>(COUNT_RATES_SQL, { contractorId }))[0].N;
				await observe(`${row.keys.join('-')}-db-${created.travelId}`, {
					endpoint: 'SELECT TRAVEL + SIMULATIONPRICEI + COUNT(CONTRACTOR_CARRIERRATES)',
					variation: { baselineFrom: base!.sources, contractorId, ratesBefore, ratesAfter },
					status: 200,
					response: travel
				});
				expect(travel.CARRIERRATE_ID, 'SIMULATIONPRICEI.CARRIERRATE_ID = tarifador del contractor (baseline)').toBe(
					base!.carrierRateId
				);
				expect(travel.CARRIERRATE_BY_COST, 'CARRIERRATE_BY_COST = baseline (por costo)').toBe(base!.byCost ? 1 : 0);
				expect(travel.PRICEPOINTTOPOINT, 'PRICEPOINTTOPOINT = baseline vivo').toBe(base!.sale);
				expect(travel.PRICEPOINTTOPOINT_COST, 'PRICEPOINTTOPOINT_COST = baseline vivo').toBe(base!.cost);
				if (row.inherits) {
					expect(
						travel.PRICEPOINTTOPOINT_COST,
						'PRICEPOINTTOPOINT_COST distinto de PRICEPOINTTOPOINT, como corresponde a un tarifador por costo'
					).not.toBe(travel.PRICEPOINTTOPOINT);
					expect(ratesAfter, 'ninguna fila nueva de CONTRACTOR_CARRIERRATES para el contractor').toBe(ratesBefore);
				}
				// Sin chofer: el alta no asigna ni despacha (STATE 9 = esperando asignación).
				expect(travel.STATE, 'TRAVEL.STATE tras el alta (9, sin chofer)').toBe(9);
				expect(travel.DRIVER_ID, 'TRAVEL.DRIVER_ID: el alta no asigna chofer').toBeNull();
			}
		);
	}
});
