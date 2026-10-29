// tests/components/db/travelHistoryOracle.ts
// Oráculo DB read-only de TM-1416 (MG-1537-AC5): el cierre GMT (22:00 ART = 01:00 UTC) copia a `TRAVEL_HISTORY` las
// cuatro columnas de otros costos de `PRICEADDITIONAL`. No existe endpoint que dispare el cron, así que el caso es una
// verificación de DB por naturaleza (Gherkin: «Cobertura NO-UI por naturaleza aceptada por el QA lead 19/10»).
//
// HALLAZGO DE DISEÑO (T0, 21/10/2026, TEST): `TRAVEL_HISTORY.ADDITIONAL_ID` conserva el id de `PRICEADDITIONAL` tras el
// cierre, así que la fila fuente SIGUE alcanzable (el plan PK-A la daba por inalcanzable porque unía por
// `FINALPRICE_ID`) y NO hace falta una foto previa al cierre: el oráculo «iguales a los de PRICEADDITIONAL» se verifica
// directamente, para los viajes de referencia y para los cierres recientes.
//
// Contrato (KATA): funciones de lectura que lanzan si la query falla (propaga `OracleDb.query`); el comparador es PURO y
// no toca la DB (ver `travelHistoryOracle.unit.ts`).

import type { OracleDb } from '@db/OracleDb';

/** Las cuatro columnas de otros costos que copia el cierre GMT (mismo nombre en las dos tablas). */
export const OTHER_COST_COLUMNS = [
	'OTHERCOST',
	'OTHER_COST_TOTAL_NOCOM',
	'OTHER_COST_TOTAL_PRICE_COST',
	'OTHER_COST_PRICE_COST_NOCOM'
] as const;

export type OtherCostColumn = (typeof OTHER_COST_COLUMNS)[number];

export type OtherCostValues = Record<OtherCostColumn, number | null>;

export interface TravelHistoryRow extends OtherCostValues {
	TRAVEL_ID: number;
	STATE: number;
	ADDITIONAL_ID: number | null;
	HISTORIC_EMISSION_DATE: Date | string | null;
}

export interface PriceAdditionalRow extends OtherCostValues {
	ID: number;
}

export interface HistoryItemRow {
	ID: number;
	NAME: string | null;
	PRICE: number | null;
	PRICE_COST: number | null;
	IS_COMMISIONABLE: number | null;
}

/** Cierre reciente con su fuente: una fila de TRAVEL_HISTORY emparejada con su PRICEADDITIONAL. */
export interface ClosedTravelPair {
	history: TravelHistoryRow;
	source: PriceAdditionalRow;
}

const HISTORY_SQL = `SELECT TRAVEL_ID, STATE, ADDITIONAL_ID, HISTORIC_EMISSION_DATE, OTHERCOST, OTHER_COST_TOTAL_NOCOM,
OTHER_COST_TOTAL_PRICE_COST, OTHER_COST_PRICE_COST_NOCOM FROM TRAVEL_HISTORY WHERE TRAVEL_ID = :travelId`;

const ADDITIONAL_SQL = `SELECT ID, OTHERCOST, OTHER_COST_TOTAL_NOCOM, OTHER_COST_TOTAL_PRICE_COST,
OTHER_COST_PRICE_COST_NOCOM FROM PRICEADDITIONAL WHERE ID = :id`;

const ITEMS_SQL = `SELECT ID, NAME, PRICE, PRICE_COST, IS_COMMISIONABLE FROM TRAVEL_OTHERCOST_HISTORY
WHERE PRICEADDITIONAL_ID = :id ORDER BY ID`;

/** Filas de TRAVEL_HISTORY del viaje (el Gherkin exige exactamente una). */
export async function readTravelHistory(db: OracleDb, travelId: number): Promise<TravelHistoryRow[]> {
	return db.query<TravelHistoryRow>(HISTORY_SQL, { travelId });
}

/** Fila fuente `PRICEADDITIONAL`, o `null` si ya no existe. */
export async function readPriceAdditional(db: OracleDb, id: number): Promise<PriceAdditionalRow | null> {
	const rows = await db.query<PriceAdditionalRow>(ADDITIONAL_SQL, { id });
	return rows[0] ?? null;
}

/** Ítems de `TRAVEL_OTHERCOST_HISTORY` del `PRICEADDITIONAL` (solo observación: ver spec). */
export async function readHistoryItems(db: OracleDb, additionalId: number): Promise<HistoryItemRow[]> {
	return db.query<HistoryItemRow>(ITEMS_SQL, { id: additionalId });
}

/**
 * M1 (dinámico): viajes finalizados (STATE 6) del carrier cuyo cierre GMT ocurrió en los últimos `lookbackDays` días y
 * cuya fila fuente sigue existiendo, para comparar histórico vs fuente. Los viajes sin `ADDITIONAL_ID` o con la fuente
 * ya borrada no son comparables y quedan fuera (se informan aparte por conteo).
 */
export async function listRecentClosedPairs(
	db: OracleDb,
	args: { carrierId: number; lookbackDays: number; limit: number }
): Promise<ClosedTravelPair[]> {
	const rows = await db.query<Record<string, unknown>>(
		`SELECT th.TRAVEL_ID, th.STATE, th.ADDITIONAL_ID, th.HISTORIC_EMISSION_DATE,
		        th.OTHERCOST AS H_OTHERCOST, th.OTHER_COST_TOTAL_NOCOM AS H_NOCOM,
		        th.OTHER_COST_TOTAL_PRICE_COST AS H_PRICE_COST, th.OTHER_COST_PRICE_COST_NOCOM AS H_PRICE_COST_NOCOM,
		        pa.ID AS PA_ID, pa.OTHERCOST AS P_OTHERCOST, pa.OTHER_COST_TOTAL_NOCOM AS P_NOCOM,
		        pa.OTHER_COST_TOTAL_PRICE_COST AS P_PRICE_COST, pa.OTHER_COST_PRICE_COST_NOCOM AS P_PRICE_COST_NOCOM
		 FROM TRAVEL_HISTORY th JOIN PRICEADDITIONAL pa ON pa.ID = th.ADDITIONAL_ID
		 WHERE th.CARRIERACCOUNT_ID = :carrierId AND th.STATE = 6
		   AND th.HISTORIC_EMISSION_DATE >= SYSDATE - :lookbackDays
		 ORDER BY th.HISTORIC_EMISSION_DATE DESC, th.TRAVEL_ID DESC
		 FETCH FIRST :limit ROWS ONLY`,
		args
	);
	return rows.map((r) => ({
		history: {
			TRAVEL_ID: r.TRAVEL_ID as number,
			STATE: r.STATE as number,
			ADDITIONAL_ID: r.ADDITIONAL_ID as number | null,
			HISTORIC_EMISSION_DATE: r.HISTORIC_EMISSION_DATE as Date | string | null,
			OTHERCOST: r.H_OTHERCOST as number | null,
			OTHER_COST_TOTAL_NOCOM: r.H_NOCOM as number | null,
			OTHER_COST_TOTAL_PRICE_COST: r.H_PRICE_COST as number | null,
			OTHER_COST_PRICE_COST_NOCOM: r.H_PRICE_COST_NOCOM as number | null
		},
		source: {
			ID: r.PA_ID as number,
			OTHERCOST: r.P_OTHERCOST as number | null,
			OTHER_COST_TOTAL_NOCOM: r.P_NOCOM as number | null,
			OTHER_COST_TOTAL_PRICE_COST: r.P_PRICE_COST as number | null,
			OTHER_COST_PRICE_COST_NOCOM: r.P_PRICE_COST_NOCOM as number | null
		}
	}));
}

/** Columnas que difieren entre histórico y fuente (NULL == NULL; NULL vs valor difiere). Puro: sin DB. */
export function diffOtherCostColumns(history: OtherCostValues, source: OtherCostValues): OtherCostColumn[] {
	return OTHER_COST_COLUMNS.filter((c) => (history[c] ?? null) !== (source[c] ?? null));
}

/** Columnas de otros costos que están en NULL (el cierre debe dejarlas informadas). Puro: sin DB. */
export function nullOtherCostColumns(values: OtherCostValues): OtherCostColumn[] {
	return OTHER_COST_COLUMNS.filter((c) => values[c] === null || values[c] === undefined);
}
