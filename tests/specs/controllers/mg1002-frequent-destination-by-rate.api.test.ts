// tests/specs/controllers/mg1002-frequent-destination-by-rate.api.test.ts
// MG-1002 (Destinos frecuentes por tarifador) — contrato de API del ATP TM-1285, label `contrato-api`
// (decisión QA lead 19/10/2026: el front pide frequentDestinationByPass sin carrierRateId y no hay selector
// de tarifador, así que el rechazo solo se ejerce por API).
//
// Runs target ENV=test (carrier 1521): el pasajero Krief (10551), su tarifador 6204 y el 6203 de otro
// contractor solo existen en TEST; decisión QA lead 19/10 (contrato-api).
//
// PLAN (escenario <-> key Xray <-> oráculo)
//   TM-1436  GET carriers/{carrierId}/frequentDestinationByPass/{krief}
//            control sin carrierRateId -> 200 con los destinos habilitados del tarifador del pasajero
//              (CARRIER_RATE_DESTINATIONS ENABLED = 1, leído en vivo);
//            con carrierRateId = tarifador de otro contractor / 999999 / 0 / «abc» -> 4xx controlado, NUNCA 5xx,
//              cuerpo sin lista de destinos (Gherkin + Dev 20/10/2026: oráculo conservador, el código exacto
//              es «comportamiento observado» y se adjunta como red-*.json).
//   Solo lectura (0 escrituras).
//
// Crédito: `tms_only` en cada test (el ATC y el control no deben acreditar otras keys).

import { test, expect } from '@TestBase';
import { F2_EMPLOYEES, F2_TEST_ONLY_REASON, discoverEmployee, isF2Env } from '@data/f2';
import { observe, responseBody } from '@data/f2/observe';
import { pace } from '@data/f2/pace';

const OWN_RATE_NAME = 'QA F2 Venta';
const FOREIGN_RATE_NAME = 'QA F2 Costo y Venta';
const ENABLED_DESTINATIONS_SQL = `SELECT FREQUENTDESTINATION_ID AS FD_ID FROM CARRIER_RATE_DESTINATIONS
WHERE CARRIERRATE_ID = :rateId AND ENABLED = 1 AND DELETE_DATE IS NULL ORDER BY FREQUENTDESTINATION_ID`;

test.describe('MG-1002: frequentDestinationByPass con carrierRateId del pasajero y ajeno (contrato-api)', () => {
	test(
		'TM-1436: should list the enabled destinations of the passenger rate when carrierRateId is omitted (control)',
		{ annotation: { type: 'tms_only', description: 'TM-1436' } },
		async ({ frequentDestination, carrierRate, db, cfg }) => {
			test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
			test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): destinos habilitados no verificables.');
			const carrierId = cfg.carrierId;
			const employee = await discoverEmployee(db!, F2_EMPLOYEES.krief);
			test.skip(!employee, 'No se encontró el empleado «Krief, Philippe» del cliente Alpine F1 Team.');
			const ownRateId = await carrierRate.findRateIdByName(carrierId, OWN_RATE_NAME);
			test.skip(ownRateId == null, `No se encontró el tarifador «${OWN_RATE_NAME}» en el carrier ${carrierId}.`);

			const expected = (await db!.query<{ FD_ID: number }>(ENABLED_DESTINATIONS_SQL, { rateId: ownRateId })).map(
				(r) => r.FD_ID
			);
			expect(expected.length, 'precondición: el tarifador del pasajero tiene destinos habilitados').toBeGreaterThan(0);

			await pace();
			const list = await frequentDestination.getByPassWithoutCarrierRateId(carrierId, employee!.requesterUserId);
			await observe('TM-1436-control-sin-carrierRateId', {
				endpoint: `GET carriers/${carrierId}/frequentDestinationByPass/${employee!.requesterUserId}`,
				variation: null,
				status: list ? 200 : 0,
				response: list ? { total: list.length, ids: list.map((d) => d.id) } : null
			});
			expect(list, 'el control debe responder 200 con una lista').not.toBeNull();
			expect(
				list!.map((d) => d.id).sort((a, b) => (a ?? 0) - (b ?? 0)),
				'los destinos ofrecidos deben ser exactamente los habilitados del tarifador del pasajero'
			).toEqual(expected);
		}
	);

	const variants: Array<{ label: string; rateId: (foreign: number) => string | number }> = [
		{ label: 'tarifador-de-otro-contractor', rateId: (foreign) => foreign },
		{ label: 'inexistente-999999', rateId: () => 999999 },
		{ label: 'cero', rateId: () => 0 },
		{ label: 'no-numerico-abc', rateId: () => 'abc' }
	];

	for (const variant of variants) {
		test(
			`TM-1436: should answer a controlled 4xx without destinations and never a 5xx when carrierRateId is ${variant.label}`,
			{ annotation: { type: 'tms_only', description: 'TM-1436' } },
			async ({ frequentDestination, carrierRate, db, cfg }) => {
				test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
				test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): no se puede descubrir al pasajero.');
				const carrierId = cfg.carrierId;
				const employee = await discoverEmployee(db!, F2_EMPLOYEES.krief);
				test.skip(!employee, 'No se encontró el empleado «Krief, Philippe» del cliente Alpine F1 Team.');
				const foreignRateId = await carrierRate.findRateIdByName(carrierId, FOREIGN_RATE_NAME);
				test.skip(foreignRateId == null, `No se encontró el tarifador ajeno «${FOREIGN_RATE_NAME}».`);

				const carrierRateId = variant.rateId(foreignRateId!);
				await pace();
				const res = await frequentDestination.getByPassWithForeignCarrierRateId(carrierId, {
					passengerUserId: employee!.requesterUserId,
					carrierRateId
				});
				await observe(`TM-1436-${variant.label}`, {
					endpoint: `GET carriers/${carrierId}/frequentDestinationByPass/${employee!.requesterUserId}?carrierRateId=${carrierRateId}`,
					variation: { carrierRateId },
					status: res.status(),
					response: await responseBody(res)
				});
			}
		);
	}
});
