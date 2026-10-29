// tests/specs/controllers/data.api.test.ts
// DataController — cobertura READ-ONLY (solo GET).
// Rutas exactas: scripts/backend-route-catalog.json (DataController).
// Shapes: openapi.yaml (CSVMapperAvailableFieldsDTO, PaymentStatusDTO, RatingReason,
//   DocumentFieldSmallResponseDTO, AdminDocumentResponseDTO, CSVTravelMapperFilesDTO,
//   CSVTravelMappersDTO, CSVTravelMapperProcessingDTO, CSVTravelMapperLineToFixDTO, GenericReportRequestDTO).
// Catálogos param-free → assert fuerte 2xx + array. Endpoints carrier-scoped/CSV (feature-gated) →
//   status TOLERANTE. {module} se deriva de documents/expiration; {mapperTravelFileId}/{processId}/{mapperLineId}
//   se derivan de los listados CSV; {code} no se deriva → placeholder + tolerante (solo verifica no-5xx).
// Endpoints POST/PUT/DELETE (SQL, reports, bulk, mappers CRUD) fuera de alcance.

import { test, expect } from '@TestBase';
import { expectArray, expectObjectWithProperty } from '@helpers';
import type { MagiisApiClient } from '@clients/magiis-api-client';

const TOLERANT = [200, 400, 403, 404];
// {code} identifica un SQL/reporte guardado; no hay GET de listado para derivarlo → placeholder.
const PLACEHOLDER_CODE = '001';

// Deriva un mapperTravelFileId real desde los archivos CSV del carrier de runtime.
async function firstMapperFileId(magiisApi: MagiisApiClient, carrierId: number): Promise<number | undefined> {
	const src = await magiisApi.getJson(`data/csv/mapperTravelFiles/${carrierId}`);
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as Array<{ id?: number }>;
	return Array.isArray(body) ? body[0]?.id : undefined;
}

// Deriva un mapperLineId real desde las líneas procesadas de un archivo (processId).
async function firstProcessedLineId(
	magiisApi: MagiisApiClient,
	carrierId: number,
	processId: number
): Promise<number | undefined> {
	const src = await magiisApi.getJson(`data/csv/mapperTravelProcessed/${carrierId}/${processId}`);
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as Array<{ id?: number }>;
	return Array.isArray(body) ? body[0]?.id : undefined;
}

// Deriva un module (moduleName) real desde los documentos con vencimiento del carrier.
async function firstModuleName(magiisApi: MagiisApiClient, carrierId: number): Promise<string | undefined> {
	const src = await magiisApi.getJson(`data/documents/${carrierId}/expiration`);
	if (src.status() !== 200) return undefined;
	const body = (await src.json()) as Array<{ moduleName?: string }>;
	return Array.isArray(body) ? body[0]?.moduleName : undefined;
}

test.describe('DataController', () => {
	// ── Catálogos param-free → assert fuerte 2xx + array ───────────────────────────────────────────
	test('Validar GET data/csv/mapperAvailableFields', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('data/csv/mapperAvailableFields');
		// CSVMapperAvailableFieldsDTO — id.
		const list = await expectArray<{ id?: number }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	test('Validar GET data/epayments/status', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('data/epayments/status');
		// PaymentStatusDTO — code.
		const list = await expectArray<{ code?: string }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('code');
	});

	test('Validar GET data/ratingReason', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('data/ratingReason');
		// RatingReason — name (required).
		const list = await expectArray<{ name?: string }>(r);
		if (list.length > 0) expect(list[0]).toHaveProperty('name');
	});

	// ── carrierId = cfg.carrierId (feature-gated) → arrays; status tolerante ────────────────────────
	test('Validar GET data/documents/{carrierId}/expiration', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`data/documents/${cfg.carrierId}/expiration`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ documentFieldId?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('documentFieldId');
		}
	});

	test('Validar GET data/csv/mapperTravelFiles/{carrierId}', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`data/csv/mapperTravelFiles/${cfg.carrierId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	test('Validar GET data/csv/mapperTravels/{carrierId}', async ({ magiisApi, cfg }) => {
		const r = await magiisApi.getJson(`data/csv/mapperTravels/${cfg.carrierId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ mapperId?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('mapperId');
		}
	});

	// ── module derivado de documents/expiration → array<AdminDocumentResponseDTO> ──────────────────
	test('Validar GET data/documents/{module}', async ({ magiisApi, cfg }) => {
		const module = await firstModuleName(magiisApi, cfg.carrierId);
		test.skip(module === undefined, 'Sin documentos con moduleName en el carrier para derivar {module}');
		const r = await magiisApi.getJson(`data/documents/${encodeURIComponent(module!)}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ admDocumentId?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('admDocumentId');
		}
	});

	// ── mapperTravelFileId derivado → CSVTravelMapperFilesDTO (prop id) ─────────────────────────────
	test('Validar GET data/csv/mapperTravelFile/{mapperTravelFileId}', async ({ magiisApi, cfg }) => {
		const fileId = await firstMapperFileId(magiisApi, cfg.carrierId);
		test.skip(fileId === undefined, 'Sin archivos CSV en el carrier para derivar {mapperTravelFileId}');
		const r = await magiisApi.getJson(`data/csv/mapperTravelFile/${fileId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) await expectObjectWithProperty(r, 'id');
	});

	// ── processId derivado (id de archivo CSV) → array<CSVTravelMapperProcessingDTO> (item id) ──────
	test('Validar GET data/csv/mapperTravelProcessed/{carrierId}/{processId}', async ({ magiisApi, cfg }) => {
		const processId = await firstMapperFileId(magiisApi, cfg.carrierId);
		test.skip(processId === undefined, 'Sin archivos CSV en el carrier para derivar {processId}');
		const r = await magiisApi.getJson(`data/csv/mapperTravelProcessed/${cfg.carrierId}/${processId}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const list = await expectArray<{ id?: number }>(r);
			if (list.length > 0) expect(list[0]).toHaveProperty('id');
		}
	});

	// ── mapperLineId derivado (archivo CSV → línea procesada) → CSVTravelMapperLineToFixDTO ─────────
	test('Validar GET data/csv/mapperTravelProcessed/{mapperLineId}/getLinesToFix', async ({ magiisApi, cfg }) => {
		const processId = await firstMapperFileId(magiisApi, cfg.carrierId);
		test.skip(processId === undefined, 'Sin archivos CSV en el carrier para derivar {processId}');
		const mapperLineId = await firstProcessedLineId(magiisApi, cfg.carrierId, processId!);
		test.skip(mapperLineId === undefined, 'Sin líneas procesadas para derivar {mapperLineId}');
		const r = await magiisApi.getJson(`data/csv/mapperTravelProcessed/${mapperLineId}/getLinesToFix`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});

	// ── code placeholder (no se deriva) → GenericReportRequestDTO; solo verifica que no haya 5xx ────
	test('Validar GET data/getSQLParameters/{code}', async ({ magiisApi }) => {
		const r = await magiisApi.getJson(`data/getSQLParameters/${PLACEHOLDER_CODE}`);
		expect(TOLERANT).toContain(r.status());
		if (r.status() === 200) {
			const body = (await r.json()) as unknown;
			expect(body).toBeTruthy();
		}
	});
});
