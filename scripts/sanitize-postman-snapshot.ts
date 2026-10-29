// scripts/sanitize-postman-snapshot.ts
// Sanea el snapshot Postman de MAGIIS-API para que postman-to-openapi no crashee.
//
// Problema real del snapshot (2026-06, 851 reqs):
//   - 333 query params con value="" → postman-to-openapi@3.0.1 lanza
//     `TypeError: Invalid URL` en scrapeURL al hacer new URL('?carrierCode=&...').
//   - 345 requests perdieron la ruta (url.raw vacío o solo query, sin host/path).
//     Esos NO se pueden convertir; se excluyen y se reportan (gap → reconciliar
//     contra Documentacion_Tecnica_Endpoints_Backend_Magiis (handler→ruta)).
//
// REPARACIÓN (Workstream A): antes de excluir un request sin ruta, se intenta
// reconstruir la ruta con scripts/backend-route-catalog.json, que mapea
// (Controller, "VERB handler") → ruta efectiva (transcrito del doc backend v1.72.2).
// El request roto conserva folder=Controller y name="VERB handler" en el snapshot,
// que son la clave del join. Si hay match, se reconstruye url.raw y se reincorpora.
//
// Output:
//   - snapshots/MAGIIS-API.sanitized.json  (requests convertibles + reparados)
//   - snapshots/MAGIIS-API.broken.json     (los que siguen sin ruta, gap real)
//
// Uso: tsx scripts/sanitize-postman-snapshot.ts  (o via generate:openapi)

import path from 'node:path';
import { promises as fs } from 'node:fs';

type PostmanQuery = { key?: string; value?: string | null; description?: string; disabled?: boolean };
type PostmanUrl = { raw?: string; host?: string[]; path?: string[]; query?: PostmanQuery[] };
type PostmanRequest = { url?: PostmanUrl | string; method?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PostmanItem = { name?: string; item?: PostmanItem[]; request?: PostmanRequest; [k: string]: any };
type PostmanCollection = { info?: unknown; item?: PostmanItem[]; event?: unknown; variable?: unknown };

const snapshotsDir = path.resolve(import.meta.dirname, 'snapshots');
const inputPath = path.join(snapshotsDir, 'MAGIIS-API.json');
const sanitizedPath = path.join(snapshotsDir, 'MAGIIS-API.sanitized.json');
const brokenPath = path.join(snapshotsDir, 'MAGIIS-API.broken.json');
const catalogPath = path.resolve(import.meta.dirname, 'backend-route-catalog.json');

type ExcludedRef = { name: string; method?: string; raw?: string; reason: 'no-path' | 'foreign-host' };
type RouteCatalog = Record<string, Record<string, string>>;

export type SanitizeResult = {
	total: number;
	kept: number;
	repaired: number; // rutas reconstruidas desde el catálogo
	broken: number; // siguen sin ruta (gap real)
	foreign: number; // host de otro servicio (gateway MGW, API pública, etc.)
	emptyQueryDropped: number;
	sanitizedPath: string;
	brokenPath: string;
	excludedRefs: ExcludedRef[];
	foreignByVar: Record<string, number>;
};

const isEmptyValue = (v: unknown) => v === '' || v === null || v === undefined;

// Solo estas variables corresponden a magiis-be (API v0.2). base_url/magiis son
// host+prefijo; el resto son path params legítimos. Cualquier otra var de host
// (API_ENDPOINT, base_url_mgw, magiis_public, ...) apunta a OTRO servicio.
const MAGIIS_BE_VARS = new Set(['base_url', 'magiis', 'carrierId', 'driverId', 'flow_travel_id']);

/** Nombres de variables {{...}} presentes en el raw, normalizados (sin `_.`, sin spaces). */
function urlVarNames(raw: string): string[] {
	const matches = raw.match(/\{\{\s*([^}]*?)\s*\}\}/g) ?? [];
	return matches.map((m) => m.replace(/[{}]/g, '').trim().replace(/^_\./, ''));
}

/** true si la URL usa un host de otro servicio (variable ajena a magiis-be). */
function usesForeignHost(url: PostmanUrl): { foreign: boolean; vars: string[] } {
	const raw = typeof url.raw === 'string' ? url.raw : '';
	const foreignVars = urlVarNames(raw).filter((v) => !MAGIIS_BE_VARS.has(v));
	return { foreign: foreignVars.length > 0, vars: foreignVars };
}

/** Devuelve la ruta "real" (sin vars ni query). Vacío ⇒ request rota. */
function extractPath(url: PostmanUrl): string {
	if (Array.isArray(url.path) && url.path.length > 0) {
		return url.path.filter(Boolean).join('/');
	}
	const raw = typeof url.raw === 'string' ? url.raw : '';
	const beforeQuery = raw.split('?')[0] ?? '';
	const noVars = beforeQuery.replace(/\{\{[^}]+\}\}/g, '');
	return noVars.replace(/^\/+/, '');
}

/** Handler puro del name del request Postman ("GET getAdminTypes" → "GET getAdminTypes" se usa tal cual como clave). */
function catalogKeyFromName(name: string): string {
	return name.trim().replace(/\s+/g, ' ');
}

/** Reconstruye una url magiis-be a partir de una ruta del catálogo. */
function repairUrl(url: PostmanUrl, route: string): void {
	// Mantiene la convención de los requests sanos: {{base_url}}{{magiis}}/ruta.
	delete url.host;
	delete url.path;
	url.query = [];
	url.raw = `{{base_url}}{{magiis}}/${route.replace(/^\/+/, '')}`;
}

/** Reconstruye url.raw con solo los query params de valor no vacío. */
function rebuildRaw(url: PostmanUrl, keptQuery: PostmanQuery[]): string {
	const raw = typeof url.raw === 'string' ? url.raw : '';
	let base = raw.split('?')[0] ?? '';
	if (!base && Array.isArray(url.host)) {
		base = url.host.join('') + (Array.isArray(url.path) ? '/' + url.path.join('/') : '');
	}
	const qs = keptQuery.map((q) => `${q.key ?? ''}=${q.value ?? ''}`).join('&');
	return qs ? `${base}?${qs}` : base;
}

export async function sanitizeSnapshot(): Promise<SanitizeResult> {
	await fs.access(inputPath).catch(() => {
		throw new Error(`Snapshot Postman no encontrado: ${inputPath}\nCorré primero: npm run fetch:collection`);
	});

	const collection = JSON.parse(await fs.readFile(inputPath, 'utf8')) as PostmanCollection;
	const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8')) as RouteCatalog;

	let total = 0;
	let repaired = 0;
	let broken = 0;
	let foreign = 0;
	let emptyQueryDropped = 0;
	const excludedRefs: ExcludedRef[] = [];
	const foreignByVar: Record<string, number> = {};

	// folder = nombre del folder Postman padre = Controller (clave del catálogo).
	function prune(items: PostmanItem[] | undefined, folder: string | null): PostmanItem[] {
		if (!items) return [];
		const out: PostmanItem[] = [];
		for (const it of items) {
			if (it.item) {
				it.item = prune(it.item, it.name ?? folder);
				// conservar folders aunque queden vacíos (estructura por controller)
				out.push(it);
				continue;
			}
			if (!it.request) {
				out.push(it);
				continue;
			}
			total++;
			const url = it.request.url;
			const objUrl = typeof url === 'object' && url !== null ? url : null;
			const hasPath = objUrl ? extractPath(objUrl).length > 0 : false;
			if (!hasPath) {
				// Intento de reparación: (Controller, "VERB handler") → ruta del catálogo.
				const key = catalogKeyFromName(it.name ?? '');
				const route = folder ? catalog[folder]?.[key] : undefined;
				if (route && objUrl) {
					repairUrl(objUrl, route);
					it.request.url = objUrl;
					repaired++;
					out.push(it);
					continue;
				}
				broken++;
				excludedRefs.push({
					name: it.name ?? '(sin nombre)',
					method: it.request.method,
					raw: objUrl && typeof objUrl.raw === 'string' ? objUrl.raw : '',
					reason: 'no-path'
				});
				continue;
			}
			const url2 = objUrl as PostmanUrl;
			const { foreign: isForeign, vars } = usesForeignHost(url2);
			if (isForeign) {
				foreign++;
				for (const v of vars) foreignByVar[v] = (foreignByVar[v] ?? 0) + 1;
				excludedRefs.push({
					name: it.name ?? '(sin nombre)',
					method: it.request.method,
					raw: typeof url2.raw === 'string' ? url2.raw : '',
					reason: 'foreign-host'
				});
				continue;
			}
			if (Array.isArray(url2.query)) {
				const kept = url2.query.filter((q) => !isEmptyValue(q.value));
				emptyQueryDropped += url2.query.length - kept.length;
				url2.query = kept;
				url2.raw = rebuildRaw(url2, kept);
			}
			out.push(it);
		}
		return out;
	}

	collection.item = prune(collection.item, null);

	await fs.writeFile(sanitizedPath, JSON.stringify(collection, null, '\t'), 'utf8');
	await fs.writeFile(
		brokenPath,
		JSON.stringify(
			{
				generatedFrom: 'MAGIIS-API.json',
				repairedFromCatalog: repaired,
				excluded: broken + foreign,
				brokenNoPath: broken,
				foreignHost: foreign,
				foreignByVar,
				requests: excludedRefs
			},
			null,
			'\t'
		),
		'utf8'
	);

	return {
		total,
		kept: total - broken - foreign,
		repaired,
		broken,
		foreign,
		emptyQueryDropped,
		sanitizedPath,
		brokenPath,
		excludedRefs,
		foreignByVar
	};
}

// CLI directo
if (import.meta.filename === process.argv[1]) {
	const r = await sanitizeSnapshot();
	console.log(
		`Saneado: ${r.kept}/${r.total} magiis-be convertibles (${r.repaired} rutas reparadas del catálogo) · ${r.emptyQueryDropped} query vacíos removidos · ${r.broken} siguen sin ruta · ${r.foreign} de otro servicio → ${path.basename(r.brokenPath)}`
	);
	if (Object.keys(r.foreignByVar).length) console.log('  foreign host vars:', r.foreignByVar);
}
