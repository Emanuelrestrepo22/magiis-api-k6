// tests/utils/reporters/xray-consolidate.ts
// Consolidación pura de las filas de un mismo testKey en un único resultado Xray.
//
// Una fila = un TestResult de Playwright (un test() o el retry final) que aporta
// evidencia a un testKey (ver EMIT-ALL en xray-reporter.ts). Regla de consolidación:
//   - Si hay ≥1 fila EJECUTADA (skipped=false) → status = peor estado ENTRE LAS
//     EJECUTADAS, orden FAILED > ABORTED > PASSED. Las filas skipped NUNCA participan
//     de ese cómputo: un test.skip() estructural (fila no aplicable al entorno) no
//     degrada un testKey que ya tiene evidencia ejecutada.
//   - Si TODAS las filas son skipped → TODO (no hay evidencia ejecutada).
//   - comment: conserva el comentario de error de la PRIMERA fila ejecutada que
//     alcanzó el status ganador (mismo criterio "empate no reemplaza" del merge
//     previo) y SIEMPRE suma, si hay filas skipped, una sección auditable con el
//     título y el motivo de cada una.
//   - start/finish: mínimo/máximo de las filas ejecutadas (o de todas si todas son skip).
type XrayStatus = 'PASSED' | 'FAILED' | 'ABORTED' | 'TODO';

interface RowResult {
	status: XrayStatus;
	skipped: boolean;
	title: string;
	skipReason?: string;
	start?: string;
	finish?: string;
	comment?: string;
}

interface ConsolidatedResult {
	status: XrayStatus;
	start?: string;
	finish?: string;
	comment?: string;
}

type ExecutedStatus = 'PASSED' | 'ABORTED' | 'FAILED';

// Orden de severidad SOLO entre filas ejecutadas — TODO (skip) nunca entra a esta escala.
const EXECUTED_SEVERITY: Record<ExecutedStatus, number> = { PASSED: 0, ABORTED: 1, FAILED: 2 };

function worstExecutedStatus(executed: RowResult[]): ExecutedStatus {
	let worst: ExecutedStatus = 'PASSED';
	for (const row of executed) {
		const status = row.status as ExecutedStatus;
		if (EXECUTED_SEVERITY[status] > EXECUTED_SEVERITY[worst]) worst = status;
	}
	return worst;
}

function aggregateTimes(rows: RowResult[]): { start?: string; finish?: string } {
	const starts = rows.map((r) => r.start).filter((v): v is string => !!v);
	const finishes = rows.map((r) => r.finish).filter((v): v is string => !!v);
	return {
		start: starts.length > 0 ? starts.reduce((min, v) => (v < min ? v : min)) : undefined,
		finish: finishes.length > 0 ? finishes.reduce((max, v) => (v > max ? v : max)) : undefined
	};
}

// Etiqueta neutra (el motivo propio de cada fila ya dice si es entorno, alcance o contrato).
// Sección auditable en español: se agrega siempre que haya ≥1 fila skipped, sin
// importar si el status final quedó determinado por ejecutadas o si todas son skip.
function skippedRowsSection(skippedRows: RowResult[]): string | undefined {
	if (skippedRows.length === 0) return undefined;
	const lines = skippedRows.map((r) => `- ${r.title}: ${r.skipReason ?? 'sin motivo declarado'}`);
	return `Filas omitidas (${skippedRows.length}):\n${lines.join('\n')}`;
}

export function consolidateRows(rows: RowResult[]): ConsolidatedResult {
	const executed = rows.filter((r) => !r.skipped);
	const skipped = rows.filter((r) => r.skipped);
	const skipSection = skippedRowsSection(skipped);

	if (executed.length === 0) {
		// Todas las filas son skip: no hay evidencia ejecutada.
		return { status: 'TODO', ...aggregateTimes(rows), comment: skipSection };
	}

	const status = worstExecutedStatus(executed);
	const winner = executed.find((r) => r.status === status);
	const comment = skipSection ? [winner?.comment, skipSection].filter(Boolean).join('\n\n') : winner?.comment;

	return { status, ...aggregateTimes(executed), comment };
}

export type { RowResult, ConsolidatedResult, XrayStatus };
