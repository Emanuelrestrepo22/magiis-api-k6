// tests/utils/reporters/xray-consolidate.unit.ts
// Unit test del consolidador puro de filas Xray (node:test — sin runner de Playwright).
// Sufijo .unit.ts para que Playwright (testMatch **/*.api.test.ts) NO lo recoja.
// Run: npm run test:unit:reporters
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consolidateRows } from './xray-consolidate';
import type { RowResult } from './xray-consolidate';

function row(partial: Partial<RowResult> & Pick<RowResult, 'status' | 'skipped' | 'title'>): RowResult {
	return { start: undefined, finish: undefined, comment: undefined, skipReason: undefined, ...partial };
}

test('todas las filas PASSED -> PASSED', () => {
	const result = consolidateRows([
		row({ status: 'PASSED', skipped: false, title: 'fila 1' }),
		row({ status: 'PASSED', skipped: false, title: 'fila 2' })
	]);
	assert.equal(result.status, 'PASSED');
	assert.equal(result.comment, undefined);
});

test('PASSED + skip estructural -> PASSED, con nota de fila omitida y motivo en comment', () => {
	const result = consolidateRows([
		row({ status: 'PASSED', skipped: false, title: 'fila ejecutada' }),
		row({ status: 'TODO', skipped: true, title: 'fila omitida', skipReason: 'no aplica en este entorno' })
	]);
	assert.equal(result.status, 'PASSED');
	assert.match(result.comment ?? '', /Filas omitidas \(1\)/);
	assert.match(result.comment ?? '', /fila omitida: no aplica en este entorno/);
});

test('PASSED + FAILED -> FAILED conservando el comment de error', () => {
	const result = consolidateRows([
		row({ status: 'PASSED', skipped: false, title: 'fila ok' }),
		row({ status: 'FAILED', skipped: false, title: 'fila rota', comment: 'expect(x).toBe(y) fallo' })
	]);
	assert.equal(result.status, 'FAILED');
	assert.equal(result.comment, 'expect(x).toBe(y) fallo');
});

test('todas las filas skip -> TODO con nota de todas las filas omitidas', () => {
	const result = consolidateRows([
		row({ status: 'TODO', skipped: true, title: 'fila A', skipReason: 'motivo A' }),
		row({ status: 'TODO', skipped: true, title: 'fila B', skipReason: 'motivo B' })
	]);
	assert.equal(result.status, 'TODO');
	assert.match(result.comment ?? '', /Filas omitidas \(2\)/);
	assert.match(result.comment ?? '', /fila A: motivo A/);
	assert.match(result.comment ?? '', /fila B: motivo B/);
});

test('ABORTED + PASSED -> ABORTED (peor estado entre ejecutadas)', () => {
	const result = consolidateRows([
		row({ status: 'PASSED', skipped: false, title: 'fila ok' }),
		row({ status: 'ABORTED', skipped: false, title: 'fila interrumpida', comment: 'status=interrupted' })
	]);
	assert.equal(result.status, 'ABORTED');
	assert.equal(result.comment, 'status=interrupted');
});

test('start/finish: minimo y maximo SOLO entre las filas ejecutadas', () => {
	const result = consolidateRows([
		row({
			status: 'PASSED',
			skipped: false,
			title: 'fila 1',
			start: '2026-01-01T00:00:05.000Z',
			finish: '2026-01-01T00:00:06.000Z'
		}),
		row({
			status: 'PASSED',
			skipped: false,
			title: 'fila 2',
			start: '2026-01-01T00:00:01.000Z',
			finish: '2026-01-01T00:00:09.000Z'
		}),
		row({
			status: 'TODO',
			skipped: true,
			title: 'fila omitida',
			skipReason: 'no aplica',
			start: '2026-01-01T00:00:00.000Z',
			finish: '2026-01-01T00:00:10.000Z'
		})
	]);
	assert.equal(result.status, 'PASSED');
	assert.equal(result.start, '2026-01-01T00:00:01.000Z');
	assert.equal(result.finish, '2026-01-01T00:00:09.000Z');
});

test('motivos fuera de alcance / contrato se conservan y la etiqueta no dice "por entorno"', () => {
	const result = consolidateRows([
		row({ status: 'PASSED', skipped: false, title: 'fila ok' }),
		row({ status: 'TODO', skipped: true, title: 'fila A', skipReason: 'fuera de alcance' }),
		row({ status: 'TODO', skipped: true, title: 'fila B', skipReason: 'endpoint removido por cambio de contrato' })
	]);
	assert.match(result.comment ?? '', /Filas omitidas \(2\)/);
	assert.doesNotMatch(result.comment ?? '', /por entorno/);
	assert.match(result.comment ?? '', /fila A: fuera de alcance/);
	assert.match(result.comment ?? '', /fila B: endpoint removido por cambio de contrato/);
});

// --- extractTestKeys: explicit `tms_only` key vs inherited runtime @atc keys ---
import type { TestCase, TestResult } from '@playwright/test/reporter';
import { extractTestKeys } from './xray-reporter';

type Ann = { type: string; description?: string };
function keysFor(title: string, staticAnns: Ann[], runtimeAnns: Ann[]): string[] {
	return extractTestKeys(
		{ title, annotations: staticAnns } as unknown as TestCase,
		{ annotations: runtimeAnns } as unknown as TestResult
	);
}

test('tms_only + @atc heredado (runtime tms) -> solo la key explicita', () => {
	const keys = keysFor(
		'TM-1158: should ...',
		[{ type: 'tms_only', description: 'TM-1158' }],
		[{ type: 'tms', description: 'TM-945' }]
	);
	assert.deepEqual(keys, ['TM-1158']);
});

test('sin tms_only: @atc runtime sigue ganando sobre el titulo (comportamiento existente)', () => {
	assert.deepEqual(keysFor('TM-1158: x', [], [{ type: 'tms', description: 'TM-945' }]), ['TM-945']);
});

test('sin tms_only: varias keys tms se acreditan todas y sin anotaciones cae al titulo', () => {
	assert.deepEqual(
		keysFor('t', [{ type: 'tms', description: 'TM-1' }], [{ type: 'tms', description: 'TM-2' }]).sort(),
		['TM-1', 'TM-2']
	);
	assert.deepEqual(keysFor('MG-158 algo', [], []), ['MG-158']);
});

test('varias tms_only en el mismo test -> se acreditan todas (sin duplicados) y ganan sobre el @atc heredado', () => {
	const keys = keysFor(
		'TM-1395+TM-1431: should resolve the contractor rate',
		[
			{ type: 'tms_only', description: 'TM-1395' },
			{ type: 'tms_only', description: 'TM-1431' },
			{ type: 'tms_only', description: 'TM-1395' }
		],
		[{ type: 'tms', description: 'TM-945' }]
	);
	assert.deepEqual(keys, ['TM-1395', 'TM-1431']);
});
