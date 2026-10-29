/**
 * MG-116 / TM-691 — las 26 filas de MAGIIS_PLACE con flag de aeropuerto, con sus nombres reales.
 *
 * Corrige la consulta anterior: filtraba por una columna `name` que no existe en esta tabla (son
 * SHORT_NAME y FORMATTED_ADDRESS), asi que caia al fallback y devolvia filas SIN filtrar. Un
 * "sospechosas: 15" que en realidad eran las primeras 15 de 26 sin criterio aplicado.
 *
 * Solo SELECT.
 */

import 'dotenv/config';
import { OracleDb } from '../tests/components/db/OracleDb';

const log = (m: string): void => console.log(`[air] ${m}`);
const line = (): void => log('='.repeat(74));

type Row = {
	AIRPORT_IATA: string;
	SHORT_NAME: string;
	FORMATTED_ADDRESS: string;
	TYPES: string | null;
	SOURCE_TYPE: string | null;
	HITS: number | null;
};

const AIRPORTISH = /aeropuerto|airport|aeroparque|aerodromo|aeródromo|internacional|terminal a[eé]rea/i;

async function main(): Promise<void> {
	const db = new OracleDb();

	line();
	log('MAGIIS.MAGIIS_PLACE — TODAS las filas con airport_iata poblado');
	line();

	const rows = await db.query<Row>(
		`select airport_iata, short_name, formatted_address, types, source_type, hits
		 from MAGIIS.MAGIIS_PLACE
		 where airport_iata is not null
		 order by airport_iata`
	);

	log(`filas: ${rows.length}`);
	log('');
	const bad: Row[] = [];
	for (const r of rows) {
		const looksAirport = AIRPORTISH.test(`${r.SHORT_NAME} ${r.FORMATTED_ADDRESS}`) || /airport/i.test(r.TYPES ?? '');
		if (!looksAirport) bad.push(r);
		log(
			`${looksAirport ? '  ok ' : ' >>> '}${(r.AIRPORT_IATA ?? '').padEnd(5)} ${String(r.SHORT_NAME).slice(0, 42).padEnd(44)} types=${String(r.TYPES ?? '-').slice(0, 26)}`
		);
	}

	line();
	log(`FILAS CON FLAG DE AEROPUERTO SOBRE UN LUGAR QUE NO LO ES: ${bad.length}`);
	for (const r of bad) {
		log('');
		log(`   IATA ............ ${r.AIRPORT_IATA}`);
		log(`   short_name ...... ${r.SHORT_NAME}`);
		log(`   direccion ....... ${String(r.FORMATTED_ADDRESS).slice(0, 120)}`);
		log(`   types ........... ${r.TYPES ?? '(vacio)'}`);
		log(`   source_type ..... ${r.SOURCE_TYPE ?? '(vacio)'}`);
		log(`   hits ............ ${r.HITS ?? 0}`);
	}
	line();
	log(
		bad.length
			? 'TM-691 tiene fixture EN UAT: el caso es ejecutable aca.'
			: 'Sin filas sucias en UAT: el fixture de TM-691 no se reproduce en este ambiente.'
	);
	line();
}

main().catch((err) => {
	console.error('[air] error:', err?.message ?? err);
	process.exitCode = 1;
});
