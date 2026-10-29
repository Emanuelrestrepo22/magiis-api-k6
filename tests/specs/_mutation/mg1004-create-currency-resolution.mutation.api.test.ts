// tests/specs/_mutation/mg1004-create-currency-resolution.mutation.api.test.ts
// MG-1004-AC2 — contrato de API del ATP TM-1285, label `contrato-api` (decisión QA lead 19/10/2026): el alta real
// (`POST carriers/{c}/travels`) SIN `currencyId`, con `null` y con la moneda del carrier explícita debe tomar la
// moneda del carrier y los mismos importes que hoy. PK-A (21/10/2026), plan docs/plans/PK-A-contrato-api-alta-*.md.
//
// Runs target ENV=test (carrier 1521): el tarifador 6204, el cliente Alpine F1 Team (1522) y el empleado Krief solo
// existen en TEST; decisión QA lead 19/10.
//
// PLAN (escenario <-> key Xray <-> oráculo)
//   TM-1367  create sin la clave currencyId -> 200 + travelId; en DB TRAVEL.CURRENCY_ID = moneda del baseline (9),
//            SIMULATIONPRICEI.CARRIERRATE_ID = tarifador del baseline (6204), CARRIERRATE_BY_COST = 0 y
//            PRICEPOINTTOPOINT / _COST = baseline = los de simulateAll del mismo request.
//   TM-1424  idem con currencyId = null y con currencyId = moneda del carrier (9): mismo resultado que sin el campo.
//   Baseline = viajes de referencia 71305/71082 leídos EN VIVO (`data/f2/baseline.ts`); nada de literales del Gherkin.
//   Cobertura PARCIAL declarada: las filas de UI y de app Pasajero de TM-1367 y la variante D4/6203 de TM-1424 quedan
//   manuales o diferidas.
//   NO se asierta si `create` revalida o no el límite de cuenta corriente (pregunta abierta P4 a Dev).
//
// GUARDAS: doble (ALLOW_MUTATIONS=1 y nunca prod); crea 3 viajes (1 por fila), sin chofer ni autodispatch.
// CLEANUP: cada viaje se cancela en afterEach con `travels.cancelTravel` (DTO real), aun si el test falla, y se
// verifica por DB que quedó en STATE 7.
//
// Crédito: `tms_only` (los ATC de TravelsApi corren también en otros specs).

import { test, expect } from '@TestBase';
import { F2_EMPLOYEES, F2_NOTES, F2_TEST_ONLY_REASON, buildCreateBody, discoverEmployee, isF2Env } from '@data/f2';
import { BASELINE_TRAVELS, resolveBaseline } from '@data/f2/baseline';
import { cancelAndVerify } from '@data/f2/cancel';
import type { TravelToCancel } from '@data/f2/cancel';
import { observe, responseBody } from '@data/f2/observe';
import { pace } from '@data/f2/pace';
import { forEvidence, pickByVehicle } from '@data/f2/simulation';
import type { CurrencyIdVariant, SimulationBreakdown } from '@api/TravelsApi';

const VEHICLE_TYPE_ID = 1;

const TRAVEL_SQL = `SELECT t.ID, t.STATE, t.DRIVER_ID, t.NOTE, t.CURRENCY_ID, s.CARRIERRATE_ID, s.CARRIERRATE_BY_COST,
s.PRICEPOINTTOPOINT, s.PRICEPOINTTOPOINT_COST
FROM TRAVEL t JOIN SIMULATIONPRICEI s ON s.ID = t.SIMULATIONPRICE_ID WHERE t.ID = :id`;

interface TravelRow {
	ID: number;
	STATE: number;
	DRIVER_ID: number | null;
	NOTE: string | null;
	CURRENCY_ID: number;
	CARRIERRATE_ID: number;
	CARRIERRATE_BY_COST: number;
	PRICEPOINTTOPOINT: number;
	PRICEPOINTTOPOINT_COST: number;
}

interface Row {
	key: 'TM-1367' | 'TM-1424';
	label: string;
	/** `'carrier'` = moneda del carrier explícita (id leído del baseline). */
	currencyId: 'omit' | null | 'carrier';
	note: string;
}

const ROWS: Row[] = [
	{ key: 'TM-1367', label: 'sin currencyId', currencyId: 'omit', note: F2_NOTES.defaultCurrency },
	{ key: 'TM-1424', label: 'currencyId null', currencyId: null, note: F2_NOTES.explicitCurrency },
	{ key: 'TM-1424', label: 'currencyId = moneda del carrier', currencyId: 'carrier', note: F2_NOTES.explicitCurrency }
];

test.describe('MG-1004-AC2: create sin currencyId / null / moneda del carrier (contrato-api)', () => {
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
			`${row.key}: should create the trip with the carrier currency and the baseline amounts when ${row.label}`,
			{ annotation: { type: 'tms_only', description: row.key } },
			async ({ travels, db, cfg }) => {
				test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): la pata DB no es verificable.');
				const carrierId = cfg.carrierId;
				const employee = await discoverEmployee(db!, F2_EMPLOYEES.krief);
				test.skip(!employee, 'No se encontró el empleado «Krief, Philippe» del cliente Alpine F1 Team.');
				const base = await resolveBaseline(db!, BASELINE_TRAVELS.sale6204);
				test.skip(!base, 'Viajes de referencia 71305/71082 ausentes o discrepantes: no hay baseline vivo de 6204.');
				const currencyId: CurrencyIdVariant = row.currencyId === 'carrier' ? base!.currencyId : row.currencyId;
				const body = buildCreateBody(employee!, { note: `${row.note} ${Date.now().toString(36)}` });

				// Cotización de control del mismo request (simulateAll, sin la clave): lo que la pantalla le muestra al operador.
				await pace();
				const quoteRes = await travels.requestSimulation(carrierId, { endpoint: 'simulateAll', body });
				expect(quoteRes.status(), 'simulateAll previo al alta').toBe(200);
				const quote = pickByVehicle((await quoteRes.json()) as SimulationBreakdown[], VEHICLE_TYPE_ID);
				expect(quote, 'simulateAll previo: tipo de vehículo del request').toBeDefined();

				await pace();
				const res = await travels.sendTravelWithCarrierCurrency(carrierId, {
					endpoint: 'create',
					body,
					currencyId,
					onCreated: (travelId) => {
						travelToCancel = { carrierId, travelId, label: `${row.key} ${row.label}` };
					}
				});
				const created = (await res.json()) as { travelId: number };
				test.info().annotations.push({
					type: 'travel-created',
					description: `carrier ${carrierId} · travelId ${created.travelId}`
				});
				await observe(
					`${row.key}-create-${row.currencyId === 'omit' ? 'sin-currencyId' : row.currencyId === null ? 'null' : 'moneda-carrier'}`,
					{
						endpoint: `POST carriers/${carrierId}/travels`,
						variation: { currencyId: row.currencyId === 'omit' ? '(clave omitida)' : currencyId },
						sentBody: row.currencyId === 'omit' ? body : { ...body, currencyId },
						status: res.status(),
						response: { travelId: created.travelId, ...((await responseBody(res)) as object) }
					}
				);

				const rows = await db!.query<TravelRow>(TRAVEL_SQL, { id: created.travelId });
				expect(rows, 'el viaje creado debe existir con su simulación').toHaveLength(1);
				const travel = rows[0];
				await observe(`${row.key}-db-${created.travelId}`, {
					endpoint: 'SELECT TRAVEL + SIMULATIONPRICEI',
					variation: { baselineFrom: base!.sources, simulateAll: forEvidence(quote) },
					status: 200,
					response: travel
				});
				expect(travel.CURRENCY_ID, 'TRAVEL.CURRENCY_ID = moneda del carrier (baseline)').toBe(base!.currencyId);
				expect(travel.CARRIERRATE_ID, 'SIMULATIONPRICEI.CARRIERRATE_ID = tarifador del baseline').toBe(
					base!.carrierRateId
				);
				expect(travel.CARRIERRATE_BY_COST, 'CARRIERRATE_BY_COST = baseline (por venta)').toBe(base!.byCost ? 1 : 0);
				expect(travel.PRICEPOINTTOPOINT, 'PRICEPOINTTOPOINT = baseline vivo').toBe(base!.sale);
				expect(travel.PRICEPOINTTOPOINT_COST, 'PRICEPOINTTOPOINT_COST = baseline vivo').toBe(base!.cost);
				expect(travel.PRICEPOINTTOPOINT, 'PRICEPOINTTOPOINT = simulateAll del mismo request').toBe(
					quote!.pricePointToPoint
				);
				expect(travel.PRICEPOINTTOPOINT_COST, 'PRICEPOINTTOPOINT_COST = simulateAll del mismo request').toBe(
					quote!.pricePointToPointCost
				);
				// Sin chofer: el alta no asigna ni despacha (STATE 9 = esperando asignación).
				expect(travel.STATE, 'TRAVEL.STATE tras el alta (9, sin chofer)').toBe(9);
				expect(travel.DRIVER_ID, 'TRAVEL.DRIVER_ID: el alta no asigna chofer').toBeNull();
			}
		);
	}
});
