// tests/data/f2/baseline.ts
// Baseline de importes de la campaña F2 (PK-A), leído EN VIVO de los viajes de referencia del Gherkin: ningún
// importe se copia como literal (las pantallas mostraron 43,67 y la DB 42,65; el oráculo es la DB de hoy).
//
//   - 71305 y 71082: tarifador 6204 «QA F2 Venta» (venta), ruta fija, Cuenta Corriente.
//   - 71200 y 71320: tarifador 6203 «QA F2 Costo y Venta» (por costo), ruta fija, Cuenta Corriente.
//
// Si una fila de referencia no existe o las filas de un mismo grupo no coinciden entre sí, `consensus` devuelve
// `null` y el spec se saltea con motivo (no se inventa un esperado). Si el importe cambió porque alguien editó el
// tarifador, el test falla de forma legítima: `describeDrift` arma el mensaje para distinguirlo de un defecto.

import type { OracleDb } from '@db/OracleDb';

/** Viajes de referencia por grupo de tarifador. */
export const BASELINE_TRAVELS = {
	/** 6204 «QA F2 Venta»: por venta, USD. */
	sale6204: [71305, 71082],
	/** 6203 «QA F2 Costo y Venta»: por costo, USD. */
	costSale6203: [71200, 71320]
} as const;

export interface BaselineRow {
	travelId: number;
	state: number;
	currencyId: number;
	carrierRateId: number;
	byCost: boolean;
	sale: number;
	cost: number;
}

interface BaselineDbRow {
	ID: number;
	STATE: number;
	CURRENCY_ID: number;
	CARRIERRATE_ID: number;
	CARRIERRATE_BY_COST: number;
	PRICEPOINTTOPOINT: number;
	PRICEPOINTTOPOINT_COST: number;
}

const BASELINE_SQL = `SELECT t.ID, t.STATE, t.CURRENCY_ID, s.CARRIERRATE_ID, s.CARRIERRATE_BY_COST,
s.PRICEPOINTTOPOINT, s.PRICEPOINTTOPOINT_COST
FROM TRAVEL t JOIN SIMULATIONPRICEI s ON s.ID = t.SIMULATIONPRICE_ID WHERE t.ID = :id`;

/** Lee las filas de referencia indicadas (las que no existen se omiten). */
export async function readBaseline(db: OracleDb, travelIds: readonly number[]): Promise<BaselineRow[]> {
	const rows: BaselineRow[] = [];
	for (const id of travelIds) {
		const found = await db.query<BaselineDbRow>(BASELINE_SQL, { id });
		if (found.length !== 1) continue;
		rows.push({
			travelId: found[0].ID,
			state: found[0].STATE,
			currencyId: found[0].CURRENCY_ID,
			carrierRateId: found[0].CARRIERRATE_ID,
			byCost: found[0].CARRIERRATE_BY_COST === 1,
			sale: found[0].PRICEPOINTTOPOINT,
			cost: found[0].PRICEPOINTTOPOINT_COST
		});
	}
	return rows;
}

export interface BaselineConsensus {
	currencyId: number;
	carrierRateId: number;
	byCost: boolean;
	sale: number;
	cost: number;
	/** Viajes de los que sale el consenso (para citarlos en los mensajes y en la evidencia). */
	sources: number[];
}

/**
 * Valor común de las filas del grupo, o `null` si faltan filas (se esperan `expected`) o discrepan entre sí.
 * Una discrepancia entre referencias es un problema del dato, no del backend: el spec se saltea con motivo.
 */
export function consensus(rows: BaselineRow[], expected: number): BaselineConsensus | null {
	if (rows.length !== expected || rows.length === 0) return null;
	const [first, ...rest] = rows;
	const same = rest.every(
		(r) =>
			r.currencyId === first.currencyId &&
			r.carrierRateId === first.carrierRateId &&
			r.byCost === first.byCost &&
			r.sale === first.sale &&
			r.cost === first.cost
	);
	if (!same) return null;
	return {
		currencyId: first.currencyId,
		carrierRateId: first.carrierRateId,
		byCost: first.byCost,
		sale: first.sale,
		cost: first.cost,
		sources: rows.map((r) => r.travelId)
	};
}

/** Lee y consolida un grupo de referencia en un solo paso (Discover, silent fail → `null`). */
export async function resolveBaseline(db: OracleDb, group: readonly number[]): Promise<BaselineConsensus | null> {
	return consensus(await readBaseline(db, group), group.length);
}

/**
 * Mensaje para el caso «el importe no coincide con el baseline»: si simulate y simulateAll coinciden entre sí pero
 * no con el baseline, lo más probable es que se haya editado el tarifador (R-2 del plan), no que haya un defecto.
 */
export function describeDrift(base: BaselineConsensus, observedSale: number, observedCost: number): string {
	return (
		`importes observados (venta ${observedSale} / costo ${observedCost}) distintos del baseline vivo ` +
		`(venta ${base.sale} / costo ${base.cost}, viajes ${base.sources.join(' y ')}): ` +
		'si el tarifador fue modificado después de esos viajes, la diferencia es de datos y no del backend.'
	);
}
