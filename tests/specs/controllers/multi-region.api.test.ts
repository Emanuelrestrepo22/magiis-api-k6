// tests/specs/controllers/multi-region.api.test.ts
// MultiRegionController — cobertura READ-ONLY (solo GET). Catálogo global multiregión.
// Rutas exactas desde scripts/backend-route-catalog.json (§ MultiRegionController).
// Shapes contra openapi.yaml (CountryNameResponseDTO, CountryResponseDTO,
// CurrentCurrencyValueDTO, StateResponseDTO, RegionResponseDTO, TimezoneDTO, Page).

import { test, expect } from '@TestBase';
import { expectArray, expectPageShape, expectObjectWithProperty } from '@helpers';

// Rango de fechas amplio para los endpoints paginados de currenciesValues.
const DATE_FROM = '2020-01-01T00:00:00';
const DATE_TO = '2026-12-31T00:00:00';

test.describe('MultiRegionController', () => {
	// ── Catálogos param-free → assert fuerte 2xx + array ──────────────────────
	test('Validar GET /multiregion/countries', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('multiregion/countries');
		const list = await expectArray<{ id: number; name: string; code: string }>(r);
		if (list.length > 0) {
			expect(list[0]).toHaveProperty('id');
			expect(list[0]).toHaveProperty('name');
			expect(list[0]).toHaveProperty('code');
		}
	});

	test('Validar GET /multiregion/countries/list', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('multiregion/countries/list');
		const list = await expectArray<{ name: string }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('name');
	});

	test('Validar GET /multiregion/operative/countries', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('multiregion/operative/countries');
		const list = await expectArray<{ name: string; code: string }>(r);
		if (list.length > 0) {
			expect(list[0]).toHaveProperty('name');
			expect(list[0]).toHaveProperty('code');
		}
	});

	test('Validar GET /multiregion/timezones', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('multiregion/timezones');
		const list = await expectArray<{ id: number; name: string }>(r);
		if (list.length > 0) {
			expect(list[0]).toHaveProperty('id');
			expect(list[0]).toHaveProperty('name');
		}
	});

	test('Validar GET /multiregion/currentCurrenciesValues', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('multiregion/currentCurrenciesValues');
		const list = await expectArray<{ code: string; value: number }>(r);
		if (list.length > 0) {
			expect(list[0]).toHaveProperty('code');
			expect(list[0]).toHaveProperty('value');
		}
	});

	// ── Path param date-time (no está en cfg) → tolerante + shape si 200 ──────
	test('Validar GET /multiregion/currentCurrenciesValues/{date}', async ({ magiisApi }) => {
		const r = await magiisApi.getJson(`multiregion/currentCurrenciesValues/${encodeURIComponent(DATE_FROM)}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ code: string }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('code');
		}
	});

	// ── Path param derivado de countries → states (StateResponseDTO) ──────────
	test('Validar GET /multiregion/states/countryId/{countryId}', async ({ magiisApi }) => {
		const countriesRes = await magiisApi.getJson('multiregion/countries');
		const countries = await expectArray<{ id: number }>(countriesRes);
		test.skip(countries.length === 0, 'Sin países en el ambiente para derivar countryId');
		const r = await magiisApi.getJson(`multiregion/states/countryId/${countries[0].id}`);
		const states = await expectArray<{ name: string }>(r);
		if (states.length > 0) expect(states[0]).toHaveProperty('name');
	});

	// ── Path param derivado de countries → states → regions (RegionResponseDTO)
	test('Validar GET /multiregion/regions/stateId/{stateId}', async ({ magiisApi }) => {
		const countriesRes = await magiisApi.getJson('multiregion/countries');
		const countries = await expectArray<{ id: number }>(countriesRes);
		test.skip(countries.length === 0, 'Sin países para derivar countryId');
		const statesRes = await magiisApi.getJson(`multiregion/states/countryId/${countries[0].id}`);
		const states = await expectArray<{ id: number }>(statesRes);
		test.skip(states.length === 0, 'Sin estados para derivar stateId');
		const r = await magiisApi.getJson(`multiregion/regions/stateId/${states[0].id}`);
		const regions = await expectArray<{ name: string }>(r);
		if (regions.length > 0) expect(regions[0]).toHaveProperty('name');
	});

	// ── Path param string derivado de countries/list → CountryResponseDTO ─────
	test('Validar GET /multiregion/country/{countryName}', async ({ magiisApi }) => {
		const countriesRes = await magiisApi.getJson('multiregion/countries/list');
		const countries = await expectArray<{ name: string }>(countriesRes);
		test.skip(countries.length === 0, 'Sin países para derivar countryName');
		const r = await magiisApi.getJson(`multiregion/country/${encodeURIComponent(countries[0].name)}`);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'name');
	});

	// ── Paginados con path/query date-time → tolerante + Page shape si 200 ────
	test('Validar GET /multiregion/currenciesValues/{dateFrom}/{dateTo}/paginated', async ({ magiisApi }) => {
		const r = await magiisApi.getJson(
			`multiregion/currenciesValues/${encodeURIComponent(DATE_FROM)}/${encodeURIComponent(DATE_TO)}/paginated`,
			{ params: { page: 0, size: 10 } }
		);
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});

	test('Validar GET /multiregion/currenciesValuesSummary/paginated', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('multiregion/currenciesValuesSummary/paginated', {
			params: { dateFrom: DATE_FROM, dateTo: DATE_TO, page: 0, size: 10 }
		});
		expect([200, 400, 404]).toContain(r.status());
		if (r.status() === 200) await expectPageShape(r);
	});
});
