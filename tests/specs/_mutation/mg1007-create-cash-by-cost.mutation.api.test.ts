// tests/specs/_mutation/mg1007-create-cash-by-cost.mutation.api.test.ts
// MG-1007-AC2 / MG-1004 — contrato de API del ATP TM-1285, label `contrato-api` (decisión QA lead 19/10/2026):
// la pantalla de Nuevo Viaje fuerza Cuenta Corriente con un tarifador por costo y no ofrece Efectivo, así que
// ese camino solo se ejerce por API.
//
// Runs target ENV=test (carrier 1521): el cliente «QA F2 D3 Bimonetario» (1761), su empleado «ConCC, QA Colab» y
// el tarifador por costo 6202 «QA F2 Bimonetario ARS» solo existen en TEST; decisión QA lead 19/10.
//
// PLAN (escenario <-> key Xray <-> oráculo)
//   TM-1370  create real de V2 del empleado D3 (ARS, tarifador por costo) con UNA variación: paymentMethod = CASH
//            -> 200 y el backend marca el viaje como POR VENTA. Oráculo confirmado por Dev el 20/10/2026
//            («es lo que se pidió hacer, está en los tickets»; fuente escrita MG-1004 L25-26): en DB
//            TRAVEL.PAYMENTMETHOD = CASH, SIMULATIONPRICEI.CARRIERRATE_BY_COST = 0 y
//            PRICEPOINTTOPOINT_COST = PRICEPOINTTOPOINT.
//   La fila «Tarjeta» del Gherkin sigue BLOQUEADA D5 (sin tarjeta de prueba, MX-4352): fuera de este spec.
//
// GUARDAS: doble (ALLOW_MUTATIONS=1 y nunca prod); crea 1 viaje.
// CLEANUP: el viaje creado se cancela en afterEach con `travels.cancelTravel` (DTO real), aun si el test falla.
//
// Crédito: `tms_only` (el ATC solo se usa acá, pero se declara igual por consistencia con el resto de la campaña).

import { test, expect } from '@TestBase';
import { F2_EMPLOYEES, F2_NOTES, F2_TEST_ONLY_REASON, buildCreateBody, discoverEmployee, isF2Env } from '@data/f2';
import { observe, responseBody } from '@data/f2/observe';
import { pace } from '@data/f2/pace';

const TRAVEL_SQL = `SELECT t.ID, t.STATE, t.PAYMENTMETHOD, t.CURRENCY_ID, s.CARRIERRATE_ID, s.CARRIERRATE_BY_COST,
s.PRICEPOINTTOPOINT, s.PRICEPOINTTOPOINT_COST
FROM TRAVEL t JOIN SIMULATIONPRICEI s ON s.ID = t.SIMULATIONPRICE_ID WHERE t.ID = :id`;

interface TravelRow {
	ID: number;
	STATE: number;
	PAYMENTMETHOD: string;
	CURRENCY_ID: number;
	CARRIERRATE_ID: number;
	CARRIERRATE_BY_COST: number;
	PRICEPOINTTOPOINT: number;
	PRICEPOINTTOPOINT_COST: number;
}

test.describe('MG-1007-AC2: create con Efectivo y tarifador por costo (contrato-api)', () => {
	let travelToCancel: { carrierId: number; travelId: number } | null = null;

	test.beforeEach(({ cfg }) => {
		test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
		test.skip(
			process.env.ALLOW_MUTATIONS !== '1' || cfg.env === 'prod',
			'Mutación: exige ALLOW_MUTATIONS=1 y nunca prod.'
		);
	});

	test.afterEach(async ({ travels }) => {
		if (!travelToCancel) return;
		const { carrierId, travelId } = travelToCancel;
		travelToCancel = null;
		await pace();
		await travels.cancelTravel(carrierId, travelId);
	});

	test(
		'TM-1370: should create the trip with CASH and mark it as by-sale (CARRIERRATE_BY_COST 0, cost equals sale) when the rate is by-cost',
		{ annotation: { type: 'tms_only', description: 'TM-1370' } },
		async ({ travels, db, cfg }) => {
			test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): la pata DB no es verificable.');
			const carrierId = cfg.carrierId;
			const employee = await discoverEmployee(db!, F2_EMPLOYEES.d3);
			test.skip(!employee, 'No se encontró el empleado «ConCC, QA Colab» del cliente D3 Bimonetario.');

			// Precondición [DB]: el tarifador de la moneda ARS del cliente es por costo.
			const rates = await db!.query<{ RATE_BY_COST: number }>(
				`SELECT r.RATE_BY_COST FROM CONTRACTOR_CARRIERRATES c JOIN CARRIERRATE r ON r.ID = c.CARRIERRATE_ID
				 WHERE c.CONTRACTORACCOUNT_ID = :contractorId AND r.INVOICE_CURRENCY_ID = 1`,
				{ contractorId: employee!.contractorAccountId }
			);
			expect(
				rates.map((r) => r.RATE_BY_COST),
				'precondición: el tarifador ARS del cliente D3 es por costo'
			).toEqual([1]);

			const base = buildCreateBody(employee!, {
				note: F2_NOTES.paymentOverride,
				currencyId: 1,
				fastestRoute: true,
				paymentMethod: 'CHECKING_ACCOUNT'
			});
			await pace();
			const res = await travels.createWithPaymentMethodOverride(carrierId, { body: base, paymentMethod: 'CASH' });
			const created = (await res.json()) as { travelId: number };
			travelToCancel = { carrierId, travelId: created.travelId };
			test.info().annotations.push({
				type: 'travel-created',
				description: `carrier ${carrierId} · travelId ${created.travelId}`
			});
			await observe('TM-1370-create-CASH', {
				endpoint: `POST carriers/${carrierId}/travels`,
				variation: { paymentMethod: 'CASH' },
				sentBody: { ...base, paymentMethod: 'CASH' },
				status: res.status(),
				response: { travelId: created.travelId, ...((await responseBody(res)) as object) }
			});

			const rows = await db!.query<TravelRow>(TRAVEL_SQL, { id: created.travelId });
			expect(rows, 'el viaje creado debe existir con su simulación').toHaveLength(1);
			expect(rows[0].PAYMENTMETHOD, 'PAYMENTMETHOD').toBe('CASH');
			expect(rows[0].CARRIERRATE_BY_COST, 'el backend marca el viaje como por venta (CARRIERRATE_BY_COST)').toBe(0);
			expect(rows[0].PRICEPOINTTOPOINT_COST, 'costo = venta (PRICEPOINTTOPOINT_COST = PRICEPOINTTOPOINT)').toBe(
				rows[0].PRICEPOINTTOPOINT
			);
			await observe('TM-1370-db', {
				endpoint: 'SELECT TRAVEL + SIMULATIONPRICEI',
				variation: null,
				status: 200,
				response: rows[0]
			});
		}
	);
});
