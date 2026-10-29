// tests/data/f2/index.ts
// Datos de la campaña Universal F2/F3 (ATP TM-1285, tests `contrato-api`) resueltos para el entorno TEST.
//
// POR QUÉ SOLO TEST: los tarifadores «QA F2 Venta» (6204), «QA F2 Costo y Venta» (6203) y
// «QA F2 Bimonetario ARS» (6202) y los clientes «Alpine F1 Team» (1522) y «QA F2 D3 Bimonetario» (1761)
// existen únicamente en TEST (carrier 1521). Decisión QA lead 19/10 (contrato-api): se prueban ahí.
//
// CONTRATO:
//   - `carrierId` sale de `MAGIIS_TEST_CARRIER_ID` (runtime config); nunca se escribe literal en un spec.
//   - Los ids de empleado/área/solicitante y de tarifador NO se hardcodean: se descubren en runtime por
//     nombre (`discoverEmployee` por DB; tarifadores por `CarrierRateApi.findRateIdByName`).
//   - La ruta es fija (par de lugares de MAGIIS_PLACE ya usado en las corridas del 15-16/10).
//   - Los bodies reproducen el request real que emite la pantalla de V2 (capturado el 15/10, sin cabeceras
//     ni tokens); cada test varía UN solo campo.

import { getCurrentEnv, getRuntimeConfig } from '@config/runtime';
import type { OracleDb } from '@db/OracleDb';

export type TravelRequestBody = Record<string, unknown>;

/** Razón declarada de por qué estos specs apuntan a ENV=test (se usa en `test.skip`). */
export const F2_TEST_ONLY_REASON =
	'Los tarifadores 6202/6203/6204 y los clientes 1522/1761 solo existen en TEST (carrier 1521); correr con ENV=test.';

/** `true` si el entorno activo es TEST. */
export function isF2Env(): boolean {
	return getCurrentEnv() === 'test';
}

export interface F2Place {
	placeId: string;
	latitude: string;
	longitude: string;
	shortName: string;
}

/** Ruta fija: Miami International Airport Tram a 500 Ocean Dr (MAGIIS_PLACE). */
export const F2_ROUTE: { origin: F2Place; destination: F2Place } = {
	origin: {
		placeId:
			'Ei5NaWFtaSBJbnRlcm5hdGlvbmFsIEFpcnBvcnQgVHJhbSwgRmxvcmlkYSwgVVNBIi4qLAoUChIJt9vjH1q32YgR3zRtH3Ta6_QSFAoSCb8qVpFldsGIEdBOx1vTEy73',
		latitude: '25.7956037',
		longitude: '-80.266008',
		shortName: 'Miami International Airport Tram, Florida, USA'
	},
	destination: {
		placeId: 'ChIJBXscovK02YgR0ZMakj_ww40',
		latitude: '25.7749376',
		longitude: '-80.13206129999999',
		shortName: '500 Ocean Dr, Miami Beach, FL 33139, USA'
	}
};

/** Fecha programada fija de las corridas F2/F3. */
export const F2_DATE_PROGRAMMED = '2026-10-22T14:00:00.000Z';

/**
 * Fecha programada vigente: la fija mientras falten más de 6 h; pasada esa ventana, «hoy + 2 d» a las 14:00Z.
 * (T0 21/10: simulate acepta fechas pasadas y el importe no depende de la fecha; `create` no se midió con fecha
 * pasada, por eso las corridas posteriores al 22/10 usan una fecha futura.)
 */
export function f2DateProgrammed(now: number = Date.now()): string {
	if (Date.parse(F2_DATE_PROGRAMMED) - now > 6 * 3_600_000) return F2_DATE_PROGRAMMED;
	const later = new Date(now + 2 * 24 * 3_600_000);
	later.setUTCHours(14, 0, 0, 0);
	return later.toISOString();
}

/** Notas generales de los casos (rastreables en `TRAVEL.NOTE`). */
export const F2_NOTES = {
	/** TM-1390 (Gherkin: Nota General «QA F2F3 T18-INV»). */
	currencyInvalid: 'QA F2F3 T18-INV',
	/** TM-1423 (variante simulateAll con moneda ajena al árbol). */
	currencyWithoutRate: 'QA F2F3 W1004 N1',
	/** TM-1370 (Gherkin: Nota General «QA F2F3 T16-API»). */
	paymentOverride: 'QA F2F3 T16-API',
	/** TM-1440 (cotizaciones). */
	quote: 'QA F2F3 N2 contrato-api',
	/** TM-1367 (alta sin currencyId; Gherkin: «QA F2F3 T06»). */
	defaultCurrency: 'QA F2F3 PKA T06',
	/** TM-1424 (currencyId null y = 9 explícitos). */
	explicitCurrency: 'QA F2F3 PKA T13',
	/** TM-1395 / TM-1431 (tarifador del contractor; Gherkin: «QA F2F3 T28»). */
	contractorRate: 'QA F2F3 PKA T28',
	/** TM-1426 (paridad simulate / simulateAll). */
	simulateParity: 'QA F2F3 PKA T15',
	/** TM-1394 (límite de cuenta corriente; el spec no crea viajes, la Nota solo marca el simulateAll de `I`). */
	limit: 'QA F2F3 PKA T10-L'
} as const;

export interface F2Employee {
	/** `CONTRACTOR_EMPLOYEE.ID`: es el `passengerUserId`/`contractorEmployeeId` del request. */
	employeeId: number;
	/** `CONTRACTORACCOUNT.PASSENGER_ID`: usuario autorizante (`requesterUserId`). */
	requesterUserId: number;
	/** `CONTRACTOR_EMPLOYEE.CONTRACTOR_AREA_ID`. */
	areaId: number;
	/** `CONTRACTOR_EMPLOYEE.CONTRACTORACCOUNT_ID` (cliente al que pertenece). */
	contractorAccountId: number;
}

interface EmployeeRow {
	EMPLOYEE_ID: number;
	REQUESTER_ID: number;
	AREA_ID: number;
	CONTRACTORACCOUNT_ID: number;
}

const EMPLOYEE_SQL = `SELECT e.ID AS EMPLOYEE_ID, c.PASSENGER_ID AS REQUESTER_ID, e.CONTRACTOR_AREA_ID AS AREA_ID,
e.CONTRACTORACCOUNT_ID AS CONTRACTORACCOUNT_ID
FROM CONTRACTOR_EMPLOYEE e JOIN CONTRACTORACCOUNT c ON c.ID = e.CONTRACTORACCOUNT_ID
WHERE e.NAME = :firstName AND e.LASTNAME = :lastName AND c.COMPANYNAME LIKE :company
AND e.ISACTIVE = 1 AND e.DELETIONDATE IS NULL`;

export interface F2EmployeeName {
	firstName: string;
	lastName: string;
	company: string;
}

/** Empleados de prueba (nombre exacto en CONTRACTOR_EMPLOYEE y empresa del contractor). */
export const F2_EMPLOYEES: Record<'krief' | 'd3' | 'mclarenColab' | 'mclarenOwn', F2EmployeeName> = {
	/** Krief, Philippe: contractor «BWT Alpine Formula 1 Team», único tarifador 6204 (USD, por venta). */
	krief: { firstName: 'Philippe', lastName: 'Krief', company: 'BWT Alpine%' },
	/** ConCC, QA Colab: contractor «QA F2 D3 Bimonetario LLC», tarifador 6202 (ARS, por costo). */
	d3: { firstName: 'QA Colab', lastName: 'ConCC', company: 'QA F2 D3 Bimonetario%' },
	/**
	 * «QA Fdos Empleado ConCC», contractor «McLaren Racing Limited» (1521): colaborador con cuenta corriente y sin
	 * PASSENGERACCOUNT propio (hereda el tarifador del contractor, 6203). El filtro de empresa es «McLaren Racing%»
	 * porque «McLaren%» también alcanza a «McLaren Mastercard F1 Team» (1561), que tiene otro «Zak Brown».
	 */
	mclarenColab: { firstName: 'QA Fdos', lastName: 'Empleado ConCC', company: 'McLaren Racing%' },
	/** «Zak Brown», contractor «McLaren Racing Limited» (1521): contractor con registro propio (fila N05 / viaje 71200). */
	mclarenOwn: { firstName: 'Zak', lastName: 'Brown', company: 'McLaren Racing%' }
};

/** Discover (silent fail): resuelve el empleado por nombre en DB. `null` si no existe o es ambiguo. */
export async function discoverEmployee(db: OracleDb, who: F2EmployeeName): Promise<F2Employee | null> {
	const rows = await db.query<EmployeeRow>(EMPLOYEE_SQL, who as unknown as Record<string, unknown>);
	if (rows.length !== 1) return null;
	return {
		employeeId: rows[0].EMPLOYEE_ID,
		requesterUserId: rows[0].REQUESTER_ID,
		areaId: rows[0].AREA_ID,
		contractorAccountId: rows[0].CONTRACTORACCOUNT_ID
	};
}

function travelPlace(p: F2Place): Record<string, unknown> {
	return { ...p, additionalInfo: null, specialInstruction: '', floorApt: '', waitTime: null };
}

/**
 * Body real de `simulate` / `simulateAll` de V2 para un empleado de contractor (Cuenta Corriente,
 * ruta fija). `extra` aplica la ÚNICA variación del caso.
 */
export function buildSimulateBody(employee: F2Employee, extra: TravelRequestBody = {}): TravelRequestBody {
	return {
		carrierUserId: getRuntimeConfig().carrierId,
		passengerUserId: employee.employeeId,
		requesterUserId: employee.requesterUserId,
		contractorEmployeeId: employee.employeeId,
		areaId: employee.areaId,
		origin: travelPlace(F2_ROUTE.origin),
		destination: travelPlace(F2_ROUTE.destination),
		waypoints: null,
		paymentMethod: 'CHECKING_ACCOUNT',
		platform: 'Web',
		serviceTypeId: '226',
		vehicleTypeId: 1,
		travelPreferences: { airConditioner: false, luggage: false, mascots: false, vehicleTypeId: 1, driverUserId: null },
		isProgrammed: true,
		dateProgrammed: f2DateProgrammed(),
		driverProgrammedId: 0,
		pickupGmt: 'America/New_York',
		isRental: false,
		rentalType: 'KMS_INCLUDED_PER_HOUR',
		rentalHours: '2',
		roundTrip: false,
		isDelivery: false,
		paxQty: 1,
		pbxCaller: false,
		qrPayment: false,
		avoidTolls: false,
		avoidHighways: false,
		fastestRoute: false,
		otherCosts: null,
		operatorUserId: 6715,
		affiAgreementId: null,
		firstName: null,
		lastName: null,
		mail: null,
		phoneNumber: null,
		...extra
	};
}

/** Body real de `create` de V2 (misma base que simulate + campos de alta). */
export function buildCreateBody(employee: F2Employee, extra: TravelRequestBody = {}): TravelRequestBody {
	return buildSimulateBody(employee, {
		rentalHours: '3',
		recurringPattern: 'DAYS',
		hasGuestPassenger: false,
		guestPassengerName: '',
		driverInstructions: '',
		fixConceptsCost: 0,
		taxesCost: 0,
		calculateTaxes: false,
		cardDetail: null,
		originToken: 'null',
		exceedingLimitAllow: false,
		createdBy: 'CARRIER',
		isSpecialAssign: true,
		...extra
	});
}

/** Datos de la pasajera individual de las cotizaciones (Marcela Usa Tres, tarifador Base por venta). */
export const F2_QUOTE_PASSENGER = {
	firstName: 'Marcela',
	lastName: 'Usa Tres',
	mail: 'marcela.usa.tres@yopmail.com',
	phoneNumber: '13658888777'
} as const;

/** Body real de `quotes/quote` (createQuote, canal Q) con la ruta fija. */
export function buildCreateQuoteBody(extra: TravelRequestBody = {}): TravelRequestBody {
	return {
		carrierUserId: String(getRuntimeConfig().carrierId),
		origin: { ...F2_ROUTE.origin, waitTime: null, specialInstruction: null },
		destination: { ...F2_ROUTE.destination, waitTime: null, specialInstruction: null },
		waypoints: null,
		dateProgrammed: F2_DATE_PROGRAMMED,
		pickupGmt: 'America/New_York',
		isRental: false,
		rentalType: null,
		rentalHours: null,
		roundTrip: false,
		paxQty: 1,
		luggQty: 0,
		language: 'ES',
		currency: 'USD',
		channel: 'Q',
		avoidTolls: false,
		avoidHighways: false,
		fastestRoute: false,
		vehicleTypeId: 1,
		serviceTypeId: 226,
		...F2_QUOTE_PASSENGER,
		note: F2_NOTES.quote,
		usesSmsConsent: false,
		paymentMethod: 'CREDIT_CARD',
		flightNumber: null,
		airlineName: null,
		departArrival: null,
		departReturnSchedule: null,
		otherCosts: [],
		...extra
	};
}

/** Ítem de otros costos asociado al request (por costo = tipo opuesto al tarifador por venta). */
export interface OtherCostItemInput {
	id: number;
	quantity: number;
	price: number;
	comments?: string;
}

/**
 * Body real de `quotes/quoteWeb` (pantalla «Cotización» de Carrier V1) para un pasajero individual:
 * mismo DTO de viaje que simulate, sin empleado ni área de contractor.
 */
export function buildQuoteWebBody(passengerUserId: number, extra: TravelRequestBody = {}): TravelRequestBody {
	const body = buildSimulateBody(
		{ employeeId: passengerUserId, requesterUserId: passengerUserId, areaId: 0, contractorAccountId: 0 },
		{ note: F2_NOTES.quote }
	);
	delete body.contractorEmployeeId;
	delete body.areaId;
	return { ...body, ...extra };
}
