// tests/components/db/travelHistoryOracle.unit.ts
// Unit test de los comparadores puros del oráculo de TM-1416 (node:test — sin DB ni runner de Playwright).
// Sufijo .unit.ts para que Playwright (testMatch **/*.api.test.ts) NO lo recoja.
// Run: tsx --test tests/components/db/travelHistoryOracle.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffOtherCostColumns, nullOtherCostColumns } from './travelHistoryOracle';
import type { OtherCostValues } from './travelHistoryOracle';

function values(partial: Partial<OtherCostValues> = {}): OtherCostValues {
	return {
		OTHERCOST: 19,
		OTHER_COST_TOTAL_NOCOM: 9,
		OTHER_COST_TOTAL_PRICE_COST: 10,
		OTHER_COST_PRICE_COST_NOCOM: 9,
		...partial
	};
}

test('valores iguales -> sin diferencias', () => {
	assert.deepEqual(diffOtherCostColumns(values(), values()), []);
});

test('una columna distinta se informa por nombre', () => {
	assert.deepEqual(diffOtherCostColumns(values({ OTHER_COST_TOTAL_NOCOM: 8 }), values()), ['OTHER_COST_TOTAL_NOCOM']);
});

test('NULL en el histórico con valor en la fuente difiere (el cierre no copió la columna)', () => {
	assert.deepEqual(diffOtherCostColumns(values({ OTHERCOST: null }), values()), ['OTHERCOST']);
});

test('NULL en ambos lados es igual', () => {
	assert.deepEqual(diffOtherCostColumns(values({ OTHERCOST: null }), values({ OTHERCOST: null })), []);
});

test('0 y NULL NO son equivalentes', () => {
	assert.deepEqual(
		diffOtherCostColumns(values({ OTHER_COST_PRICE_COST_NOCOM: 0 }), values({ OTHER_COST_PRICE_COST_NOCOM: null })),
		['OTHER_COST_PRICE_COST_NOCOM']
	);
});

test('nullOtherCostColumns lista solo las columnas en NULL', () => {
	assert.deepEqual(nullOtherCostColumns(values({ OTHERCOST: null, OTHER_COST_TOTAL_NOCOM: null })), [
		'OTHERCOST',
		'OTHER_COST_TOTAL_NOCOM'
	]);
	assert.deepEqual(nullOtherCostColumns(values({ OTHERCOST: 0 })), []);
});
