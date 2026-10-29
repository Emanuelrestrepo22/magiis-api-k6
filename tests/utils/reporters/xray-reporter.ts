// tests/utils/reporters/xray-reporter.ts
// Reporter Xray JSON — contrato de consistencia del portafolio QA MAGIIS.
// Portado desde magiis-carrier-v2-e2e para unificar el binding spec ↔ Test de Xray.
//
// Emite un archivo Xray JSON con el resultado de cada spec que declare su key de Test.
// El import (en CI) matchea por `testKey` de forma determinística:
//   bun xray import xray --file reports/xray-results.json
//
// Binding spec ↔ Test (EMIT-ALL — un test puede acreditar VARIOS Test de Xray):
//   1. annotation type:'tms'      → CANÓNICO (contrato de consistencia; la empuja @atc)
//   2. annotation type:'test_key' → alias aceptado
//   3. annotation type:'jira'     → puente legacy
//   4. título: test('... [MG-158] ...') → fallback, primera key AAA-123
// Se recogen TODAS las keys distinctas (estáticas del TestCase + runtime del
// TestResult) → una fila de resultado por cada Test cubierto.
//
// Consolidación por testKey (tests/utils/reporters/xray-consolidate.ts): cada test()
// que acredita una key aporta una FILA (status/skipped/title/skipReason/start/finish/
// comment). Si hay ≥1 fila EJECUTADA → status = peor estado entre las ejecutadas, orden
// FAILED > ABORTED > PASSED; las filas con test.skip() estructural (fila no aplicable al
// entorno, ej. parámetro inexistente en ese ambiente) NO participan de ese cómputo — un
// skip nunca degrada un testKey que ya tiene evidencia ejecutada. Si TODAS las filas son
// skip → TODO. El comment conserva el error de la fila fallida ganadora y SIEMPRE suma,
// si hay skips, una sección auditable con título + motivo de cada fila omitida.
//
// Specs SIN key NO se exportan; se reporta el conteo para que el gap sea visible.
// XRAY_KEY_DENYLIST (CSV) excluye keys que no son Test (Executions/Plans/Stories).
//
// Config (playwright.config.ts, OPT-IN por XRAY=1):
//   ...(process.env.XRAY ? [['./tests/utils/reporters/xray-reporter.ts', { outputFile: 'reports/xray-results.json' }]] : [])
//
// Env opcionales (los setea el step de CI):
//   XRAY_EXECUTION_KEY  → testExecutionKey (importa contra un ATR existente)
//   XRAY_TEST_PLAN_KEY  → info.testPlanKey (crea/asocia la ejecución al ATP)
//   XRAY_SUMMARY        → info.summary · XRAY_VERSION → info.version (fixVersion)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { consolidateRows } from './xray-consolidate';
import type { ConsolidatedResult, RowResult, XrayStatus } from './xray-consolidate';
import { redactSecrets } from '../redact';

interface XrayTestResult extends ConsolidatedResult {
	testKey: string;
}

interface ReporterOptions {
	outputFile?: string;
}

// Tipos de annotation que portan la key del Test (orden = prioridad).
const KEY_ANNOTATION_TYPES = ['tms', 'test_key', 'jira'];
// Annotation EXCLUSIVA: un test que la declara acredita SOLO esa key (gana sobre las keys heredadas
// de los @atc de componente compartidos y sobre el fallback de título). Opt-in por test.
const EXCLUSIVE_KEY_ANNOTATION = 'tms_only';
const KEY_IN_TITLE = /\b([A-Z][A-Z0-9]+-\d+)\b/;
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

// Segunda barrera de redacción: aunque el componente de API ya redacte headers
// sensibles al construir el error, el reporter redacta defensivamente ANTES de
// escribir el comment del run de Xray -- ese comment es el destino final del
// volcado y el costo de una fuga (token en Xray, visible a todo el proyecto) es alto.
function clean(text: string): string {
	return redactSecrets(text.replace(ANSI, '')).trim();
}

function mapStatus(status: TestResult['status']): XrayStatus {
	switch (status) {
		case 'passed':
			return 'PASSED';
		case 'failed':
		case 'timedOut':
			return 'FAILED';
		case 'interrupted':
			return 'ABORTED';
		case 'skipped':
			return 'TODO';
		default:
			return 'FAILED';
	}
}

// Denylist de keys que NO son Test de Xray (Test Executions, Test Plans, Epics,
// Stories) — se excluyen para no emitir un run contra un issue que no es Test.
// Configurable por CI vía XRAY_KEY_DENYLIST (CSV). Default vacío (reporter genérico).
const KEY_DENYLIST = new Set(
	(process.env.XRAY_KEY_DENYLIST ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
);

// Emit-all: UNA automatización (un test) puede cubrir VARIOS Test de Xray — un spec
// KATA orquesta varios @atc de componente, y cada @atc empuja su key. Devolvemos
// TODAS las keys distinctas, uniendo las annotations ESTÁTICAS del TestCase con las
// de RUNTIME del TestResult (donde @atc las agrega). La corrida acredita evidencia a
// cada Test cubierto. Fallback al título solo si no hay ninguna. Denylist filtra no-Tests.
export function extractTestKeys(test: TestCase, result: TestResult): string[] {
	const keys = new Set<string>();
	const all = [...test.annotations, ...(result.annotations ?? [])];
	const exclusive = all.filter((a) => a.type === EXCLUSIVE_KEY_ANNOTATION && a.description);
	if (exclusive.length > 0) {
		return [...new Set(exclusive.map((a) => a.description!.trim()))].filter((k) => !KEY_DENYLIST.has(k));
	}
	for (const type of KEY_ANNOTATION_TYPES) {
		for (const ann of all) {
			if (ann.type === type && ann.description) keys.add(ann.description.trim());
		}
	}
	if (keys.size === 0) {
		const m = KEY_IN_TITLE.exec(test.title);
		if (m) keys.add(m[1]);
	}
	for (const k of [...keys]) if (KEY_DENYLIST.has(k)) keys.delete(k);
	return [...keys];
}

// Motivo de un test.skip(cond, 'motivo') estructural — Playwright lo guarda como
// annotation type:'skip' (runtime, en result.annotations; a veces también reflejada
// en test.annotations). Mismo criterio de unión que extractTestKeys. Sin descripción
// declarada (skip sin motivo) → texto explícito en vez de un comment vacío.
function extractSkipReason(test: TestCase, result: TestResult): string {
	const all = [...test.annotations, ...(result.annotations ?? [])];
	const ann = all.find((a) => a.type === 'skip' && a.description);
	return ann?.description?.trim() || 'sin motivo declarado';
}

class XrayReporter implements Reporter {
	private readonly outputFile: string;
	private readonly rows = new Map<string, RowResult[]>();
	private unmapped = 0;

	constructor(options: ReporterOptions = {}) {
		this.outputFile = options.outputFile ?? process.env.XRAY_RESULTS_FILE ?? 'reports/xray-results.json';
	}

	onTestEnd(test: TestCase, result: TestResult): void {
		if (result.status !== 'passed' && result.retry < test.retries) return;

		const testKeys = extractTestKeys(test, result);
		if (testKeys.length === 0) {
			this.unmapped++;
			return;
		}

		const skipped = result.status === 'skipped';
		const status = mapStatus(result.status);
		const start = result.startTime.toISOString();
		const finish = new Date(result.startTime.getTime() + result.duration).toISOString();
		const comment =
			!skipped && result.status !== 'passed'
				? clean(result.error?.message ?? `status=${result.status}`).slice(0, 2000)
				: undefined;
		const skipReason = skipped ? extractSkipReason(test, result) : undefined;

		// Una fila por cada Test cubierto — la consolidación final (peor estado ENTRE
		// LAS EJECUTADAS, skip nunca degrada) vive en consolidateRows (onEnd).
		const row: RowResult = { status, skipped, title: test.title, skipReason, start, finish, comment };
		for (const testKey of testKeys) {
			const list = this.rows.get(testKey);
			if (list) list.push(row);
			else this.rows.set(testKey, [row]);
		}
	}

	onEnd(): void {
		const tests: XrayTestResult[] = [...this.rows.entries()].map(([testKey, rows]) => ({
			testKey,
			...consolidateRows(rows)
		}));
		const payload: Record<string, unknown> = { tests };

		if (process.env.XRAY_EXECUTION_KEY) {
			payload.testExecutionKey = process.env.XRAY_EXECUTION_KEY;
		} else {
			const info: Record<string, unknown> = {};
			if (process.env.XRAY_SUMMARY) info.summary = process.env.XRAY_SUMMARY;
			if (process.env.XRAY_VERSION) info.version = process.env.XRAY_VERSION;
			// Default TM-1283 = ATP-AUTO (stock de automatización); override por campaña con XRAY_TEST_PLAN_KEY.
			info.testPlanKey = process.env.XRAY_TEST_PLAN_KEY || 'TM-1283';
			if (Object.keys(info).length > 0) payload.info = info;
		}

		mkdirSync(dirname(this.outputFile), { recursive: true });
		writeFileSync(this.outputFile, JSON.stringify(payload, null, 2), 'utf-8');

		console.log('\n\x1b[36m%s\x1b[0m', `🧾 Xray: ${tests.length} test(s) mapeados → ${this.outputFile}`);
		if (this.unmapped > 0) {
			console.log(
				'\x1b[33m%s\x1b[0m',
				`⚠️  Xray: ${this.unmapped} spec(s) sin key → NO exportados. Añade annotation type:'tms' (o [KEY] en el título).`
			);
		}
	}
}

export default XrayReporter;
