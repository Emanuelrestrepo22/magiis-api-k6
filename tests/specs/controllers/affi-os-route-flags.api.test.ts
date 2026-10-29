// tests/specs/controllers/affi-os-route-flags.api.test.ts
// TM-969 (TC25, Xray TM) — BUG-MG-682: el alta de un acuerdo AffiOS resuelve los flags de ruta
// contra PARAMETERS del carrier SOLICITANTE (`affiProfileRequesterId`), no del oferente.
//
// Referencia positiva del ticket: este endpoint YA aplica el patrón correcto (consulta el
// parámetro del carrier), a diferencia del destino frecuente (TM-931), que no lo hace. Por eso
// este caso sostiene la salida A de la matriz de conclusión: el patrón existe en el código.
//
// Nombre de archivo `affi-os-route-flags` para no colisionar con el ya existente
// `affi-ostravel.api.test.ts` (cobertura read-only de otro track).
//
// GATE DE ENTORNO: el alta de un acuerdo AffiOS no tiene reversión conocida (no hay endpoint de
// cancelación verificado para este dominio), así que el caso completo SKIPEA fuera de TEST hasta
// confirmar perfiles de afiliado y cancelación en otros entornos — nunca se ejecuta en UAT/PROD.
// Los ids de perfil/carrier/pasajero de abajo son SOLO TEST (ver constantes rotuladas): no hay
// evidencia de perfiles de afiliado equivalentes fuera de ese entorno, así que no se inventan para
// producción (Regla de no-invención de datos).
//
// Payload real: `test-cases/regresion/scripts/tc09.sh` del repo orquestador (HTTP 200 confirmado
// en la campaña manual del 2026-09-07).

import { test, expect } from '@TestBase';
import { getCurrentEnv } from '@config/runtime';
import { mg682Data, mg682OriginToken } from '@data/mg682';
import type { AffiOsAgreementPayload } from '@components/api/AffiOsApi';

// IDs SOLO TEST — sin reversión conocida para el acuerdo AffiOS, este caso no corre fuera de TEST
// (ver test.skip del describe) y estos ids no tienen equivalente confirmado en otro entorno.
const PERFIL_SOLICITANTE_1521_SOLO_TEST = 41;
const PERFIL_SOLICITANTE_1040_SOLO_TEST = 1;
const CARRIER_1521_SOLO_TEST = 1521;
const CARRIER_1040_SOLO_TEST = 1040;
const PASAJERO_SOLO_TEST = 7570;

/** Construye el payload del acuerdo; solo cambia el perfil solicitante entre filas. */
function construirPayload(affiProfileRequesterId: number): AffiOsAgreementPayload {
	const { route } = mg682Data();
	const nombre = mg682OriginToken('TM969');
	const enDias = (dias: number): string => new Date(Date.now() + dias * 86_400_000).toISOString();

	return {
		agreementName: nombre,
		travelDate: enDias(7),
		travelDueDate: enDias(6),
		routeList: [route.origin, route.destination],
		pickupRadius: 0.5,
		dropoffRadius: 0.5,
		serviceTypesList: [1],
		passengerQty: 1,
		waitingTime: 0,
		currency: 'USD',
		notes: nombre,
		affiliateProfileList: [1],
		distance: 10.5,
		duration: 1200,
		reverse: 0,
		roundTrip: false,
		affiProfileRequesterId,
		vehicleQty: 1,
		passenger: PASAJERO_SOLO_TEST,
		paymentMethod: 'CASH',
		markupPercentage: 0,
		pickupGmt: 'America/Argentina/Buenos_Aires'
	};
}

/**
 * Ambas filas se dan de alta con el token del carrier de TEST (único con credencial en este
 * repo). Lo que cambia el resultado esperado es el PERFIL SOLICITANTE del acuerdo, no quién
 * autentica: ese es justamente el contrato que verifica el caso.
 */
const FILAS = [
	{ perfil: PERFIL_SOLICITANTE_1521_SOLO_TEST, esperado: 1, carrier: CARRIER_1521_SOLO_TEST },
	{ perfil: PERFIL_SOLICITANTE_1040_SOLO_TEST, esperado: 0, carrier: CARRIER_1040_SOLO_TEST }
] as const;

test.describe('AffiOneShotTravelController — TM-969: flags de ruta contra el carrier solicitante', () => {
	test.skip(
		getCurrentEnv() !== 'test',
		'el alta de un acuerdo AffiOS no tiene reversión conocida; no se ejecuta fuera de TEST hasta confirmar perfiles de afiliado y cancelación'
	);

	for (const fila of FILAS) {
		test(`TM-969: debería resolver los flags de ruta AffiOS contra el carrier del afiliado solicitante (perfil ${fila.perfil} → carrier ${fila.carrier})`, async ({
			affiOs,
			db
		}) => {
			test.skip(!db, 'Sin credenciales Oracle: la pata DB no es verificable');

			const respuesta = await affiOs.createAgreementResolvesRouteFlagsAgainstRequesterParameter(
				construirPayload(fila.perfil)
			);
			const cuerpo = (await respuesta.json()) as { id?: number };
			expect(cuerpo.id, 'el alta debe devolver el id del acuerdo').toBeDefined();

			const filas = await db!.query<{
				FASTEST_ROUTE: number;
				AVOID_TOLLS: number;
				AVOID_HIGHWAYS: number;
			}>('SELECT FASTEST_ROUTE, AVOID_TOLLS, AVOID_HIGHWAYS FROM AFFI_OS_TRAVEL WHERE ID = :id', { id: cuerpo.id! });

			expect(filas).toHaveLength(1);
			expect(filas[0].FASTEST_ROUTE, `FASTEST_ROUTE debe venir del parámetro del carrier ${fila.carrier}`).toBe(
				fila.esperado
			);
			// Los otros dos flags son false en ambos carriers: se verifican como no-NULL y en 0.
			expect(filas[0].AVOID_TOLLS).toBe(0);
			expect(filas[0].AVOID_HIGHWAYS).toBe(0);
		});
	}
});
