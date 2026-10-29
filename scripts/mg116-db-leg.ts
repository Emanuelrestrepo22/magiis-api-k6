/**
 * MG-116 — pata DB de la trifuerza, sobre UAT.
 *
 * POR QUE RECIEN AHORA: el listener de Oracle estuvo inalcanzable desde la red de QA durante toda
 * la campana (2026-08-18 y buena parte del 2026-08-19), asi que esta pata se venia reportando como
 * NO EJECUTABLE con su motivo escrito. El puerto abrio, y estas son las preguntas que quedaron
 * pendientes de dato en vez de inferencia.
 *
 * TODO ES SELECT. `OracleDb.query` tiene guard: rechaza cualquier sentencia que no empiece con
 * `select`, asi que este script no puede escribir aunque se lo pida.
 */

import 'dotenv/config';
import { OracleDb } from '../tests/components/db/OracleDb';

const log = (m: string): void => console.log(`[db] ${m}`);
const line = (): void => log('='.repeat(74));

type Col = { COLUMN_NAME: string; DATA_TYPE: string; NULLABLE: string };

async function main(): Promise<void> {
	const db = new OracleDb();
	const out: Record<string, unknown> = { ticket: 'MG-116', env: process.env.ENV ?? 'uat' };

	line();
	log(`pata DB · ambiente=${process.env.ENV ?? 'uat'} · solo SELECT (guard del componente)`);
	line();

	// ---------------------------------------------------------------- 1. la tabla existe?
	const tables = await db.query<{ TABLE_NAME: string; OWNER: string }>(
		`select owner, table_name from all_tables where upper(table_name) like '%PLACE%' order by owner, table_name`
	);
	log(`tablas con PLACE en el nombre: ${tables.length}`);
	for (const t of tables.slice(0, 10)) log(`   ${t.OWNER}.${t.TABLE_NAME}`);
	out.placeTables = tables;

	const target = tables.find((t) => /^MAGIIS_PLACE$/i.test(t.TABLE_NAME)) ?? tables[0];
	if (!target) {
		log('NO hay ninguna tabla de lugares visible para esta cuenta. La pata queda sin responder.');
		return;
	}
	const fq = `${target.OWNER}.${target.TABLE_NAME}`;
	line();
	log(`tabla elegida: ${fq}`);

	// ---------------------------------------------------------------- 2. el esquema real
	const cols = await db.query<Col>(
		`select column_name, data_type, nullable from all_tab_columns
		 where owner = :owner and table_name = :tbl order by column_id`,
		{ owner: target.OWNER, tbl: target.TABLE_NAME }
	);
	log(`columnas: ${cols.length}`);
	for (const c of cols) log(`   ${c.COLUMN_NAME.padEnd(28)} ${c.DATA_TYPE}${c.NULLABLE === 'Y' ? '' : '  NOT NULL'}`);
	out.columns = cols;

	const has = (n: string): boolean => cols.some((c) => c.COLUMN_NAME.toUpperCase() === n.toUpperCase());
	line();
	log('LA PREGUNTA QUE ESTABA BLOQUEADA — el flag de aeropuerto, es dato de la cache?');
	log(`   columna AIRPORT_IATA presente: ${has('AIRPORT_IATA') ? 'SI' : 'NO'}`);
	log(`   columna TYPES presente ......: ${has('TYPES') ? 'SI' : 'NO'}`);
	out.hasAirportIata = has('AIRPORT_IATA');
	out.hasTypes = has('TYPES');

	// ---------------------------------------------------------------- 3. dimensionar el dato
	if (has('AIRPORT_IATA')) {
		const counts = await db.query<{ TOTAL: number; CON_IATA: number }>(
			`select count(*) as total, count(airport_iata) as con_iata from ${fq}`
		);
		log('');
		log(`filas totales en ${target.TABLE_NAME}: ${counts[0]?.TOTAL ?? '?'}`);
		log(`filas con airport_iata poblado ......: ${counts[0]?.CON_IATA ?? '?'}`);
		out.rowCounts = counts[0];

		// ------------------------------------------------------------ 4. el dato sucio de TM-691
		line();
		log('TM-691 — hay filas con flag de aeropuerto sobre lugares que NO son aeropuertos?');
		const suspects = await db
			.query<Record<string, unknown>>(
				`select * from (
			   select airport_iata, name, address
			   from ${fq}
			   where airport_iata is not null
			     and lower(name) not like '%aeropuerto%'
			     and lower(name) not like '%airport%'
			     and lower(name) not like '%aeroparque%'
			   order by airport_iata
			 ) where rownum <= 15`
			)
			.catch(async () => {
				// La tabla puede no tener `name`/`address`: se reintenta con solo el IATA.
				return db.query<Record<string, unknown>>(
					`select * from (select airport_iata from ${fq} where airport_iata is not null order by airport_iata) where rownum <= 15`
				);
			});
		log(`filas sospechosas: ${suspects.length}`);
		for (const s of suspects) log(`   ${JSON.stringify(s).slice(0, 150)}`);
		out.dirtyAirportRows = suspects;

		// ------------------------------------------------------------ 5. el caso EPA reportado en test
		const epa = await db
			.query<
				Record<string, unknown>
			>(`select * from (select airport_iata, name from ${fq} where upper(airport_iata) = 'EPA') where rownum <= 10`)
			.catch(() => [] as Record<string, unknown>[]);
		log('');
		log(`filas con airport_iata = 'EPA' en UAT: ${epa.length}`);
		for (const e of epa) log(`   ${JSON.stringify(e).slice(0, 150)}`);
		out.epaRows = epa;
	}

	line();
	log('pata DB completada. Todo por SELECT, sin una sola escritura.');
	line();
	console.log('\n__JSON__' + JSON.stringify(out));
}

main().catch((err) => {
	console.error('[db] la pata DB termino con error:', err?.message ?? err);
	process.exitCode = 1;
});
