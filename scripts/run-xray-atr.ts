/**
 * Corre una familia de specs con el xray-reporter apuntando a un ATR FIJO
 * (XRAY_EXECUTION_KEY), en vez de crear un Test Execution nuevo por corrida.
 *
 * Espejo de `run-xray-atr.ts` en magiis-carrier-v2-e2e, adaptado a este repo
 * (API-only, un unico project `api` en playwright.config.ts -- sin la lista
 * DEFAULT_PROJECTS de la V2, que existe alli porque corre en varios browsers).
 *
 * Por que existe: TM-1167 es el ATR fijo de la suite API de MG-682 (flags de
 * ruta + destino frecuente) -- el unico lugar que muestra el estado vigente
 * de la automatizacion API de esta campana. Cada corrida ACTUALIZA los runs
 * de ese ATR (xray-reporter escribe `testExecutionKey` en vez del bloque
 * `info` cuando XRAY_EXECUTION_KEY esta seteada -- ver cabecera de
 * xray-reporter.ts). El import a Xray se hace APARTE, desde el boilerplate
 * (no lo dispara este script): `bun xray import xray --file reports/xray-results.json`.
 *
 * Decision (2026-09-10): antes esta familia reportaba a TM-1147, que TAMBIEN
 * recibia la suite UI de magiis-carrier-v2-e2e (misma familia `mg682`, ATR
 * compartido). Eso volvia el estado agregado no interpretable -- el
 * 2026-09-09 esta suite reporto PASSED=0/FAILED=1 mientras la suite UI tenia
 * casos en verde, ambas escribiendo sobre el mismo ATR. Se creo un ATR propio
 * para API (TM-1167) y TM-1147 queda exclusivo para UI. Los runs API que
 * habian quedado en TM-1147 se dejaron ahi como historial congelado (no se
 * removieron para no destruir evidencia de ejecucion que no se puede
 * regenerar sin volver a correr specs que crean datos reales) -- ver
 * descripcion de TM-1147 en Xray.
 *
 * XRAY_TEST_PLAN_KEY NO se pasa a proposito: con XRAY_EXECUTION_KEY seteada
 * el reporter arma `payload.testExecutionKey` y nunca construye el bloque
 * `info` (que es donde viviria testPlanKey) -- pasarlo seria env muerta. La
 * asociacion Test Plan <-> Test Execution ya quedo fija en Xray al crear el
 * ATR, no depende de esta env en cada corrida.
 *
 * Familias registradas:
 *   mg682 -> TM-1167 (MG-682 flags de ruta + destino frecuente, suite API):
 *     frequent-destination.api.test.ts               -> TM-930
 *     travels-times.api.test.ts                       -> TM-934
 *     data-quality-null-flags.api.test.ts             -> TM-947
 *     affi-os-route-flags.api.test.ts                 -> TM-969
 *     travels-create-route-flags.api.test.ts          -> TM-945
 *     frequent-destination-explicit-flags.api.test.ts -> TM-932 + TM-933
 *     travels-budget-route-flags.api.test.ts          -> TM-937
 *     (TC32-36, agregados 2026-09-10)                 -> TM-1158..TM-1162
 *
 * Tolerancia a specs ausentes: filtra con `existsSync` antes de invocar
 * Playwright e imprime por consola cuales se salteo y por que, para no abortar
 * la familia entera con "no tests found" mientras alguna implementacion sigue
 * en curso.
 *
 * QUE ESCRIBE CADA SPEC (importa: la familia corre tambien contra PRODUCCION):
 *   - Solo lectura / computo: travels-times, travels-budget-route-flags y las
 *     filas de simulate/simulateAll de travels-create-route-flags.
 *   - Escritura reversible: frequent-destination y
 *     frequent-destination-explicit-flags editan un destino frecuente REAL y lo
 *     restauran en el afterEach; las filas de alta de travels-create-route-flags
 *     dan de alta un viaje y lo cancelan con
 *     `PUT carriers/{carrierId}/travels/{travelId}/cancel` (body `{}`).
 *   - Sin ejecucion fuera de TEST: affi-os-route-flags (el alta de un acuerdo
 *     AffiOS no tiene endpoint de borrado; solo existe `decline`, del lado del
 *     oferente).
 *   - Solo DB: data-quality-null-flags (skipea sin driver Oracle; en produccion
 *     se resuelve de forma agentica contra la replica de lectura).
 *
 * ENV se propaga tal cual: `ENV=prod npm run test:xray:mg682` corre la familia
 * contra produccion. El default sigue siendo `test`.
 *
 * Ejecutar: npm run test:xray:mg682 [-- <args extra de playwright>]
 *   ej. verificacion de un solo caso, sin correr toda la familia:
 *   npm run test:xray:mg682 -- --grep TM-934
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

interface Family {
	executionKey: string;
	specs: string[];
}

const FAMILIES: Record<string, Family> = {
	mg682: {
		executionKey: 'TM-1167',
		specs: [
			'tests/specs/controllers/frequent-destination.api.test.ts',
			'tests/specs/controllers/travels-times.api.test.ts',
			'tests/specs/controllers/data-quality-null-flags.api.test.ts',
			'tests/specs/controllers/affi-os-route-flags.api.test.ts',
			'tests/specs/controllers/travels-create-route-flags.api.test.ts',
			'tests/specs/controllers/frequent-destination-explicit-flags.api.test.ts',
			'tests/specs/controllers/travels-budget-route-flags.api.test.ts'
		]
	}
};

const [familyName, ...extraArgs] = process.argv.slice(2);
const family = familyName ? FAMILIES[familyName] : undefined;

if (!family) {
	const known = Object.keys(FAMILIES).join(', ');
	console.error(`Familia desconocida: "${familyName ?? ''}". Familias registradas: ${known}`);
	process.exit(1);
}

// Tolerancia a specs en progreso (ver cabecera): solo se corren los que ya
// existen en el filesystem. Los ausentes se listan y se saltean sin abortar.
const existingSpecs = family.specs.filter((spec) => existsSync(spec));
const missingSpecs = family.specs.filter((spec) => !existsSync(spec));

if (missingSpecs.length > 0) {
	console.warn('Specs salteados (todavia no existen en el filesystem):');
	for (const spec of missingSpecs) {
		console.warn(`  - ${spec}`);
	}
}

if (existingSpecs.length === 0) {
	console.error('Ningun spec de la familia existe todavia -- nada para correr.');
	process.exit(1);
}

const env = {
	...process.env,
	ENV: process.env.ENV ?? 'test',
	XRAY: '1',
	XRAY_PROJECT_KEY: process.env.XRAY_PROJECT_KEY ?? 'TM',
	XRAY_EXECUTION_KEY: family.executionKey
};

const result = spawnSync('npx', ['playwright', 'test', ...existingSpecs, ...extraArgs], {
	stdio: 'inherit',
	env,
	shell: process.platform === 'win32'
});

process.exit(result.status ?? 1);
