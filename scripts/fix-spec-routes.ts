// scripts/fix-spec-routes.ts
// Codemod: corrige las rutas vacías/placeholder ('' o '{id}') de los specs
// auto-generados desde el snapshot corrupto, usando scripts/backend-route-catalog.json.
//
// Los stubs auto-generados quedaron con `getJson('')` / `postJson('', {...})` porque el
// snapshot Postman perdió la ruta. El catálogo (transcrito del doc backend v1.72.2) tiene
// la ruta efectiva por (Controller, "VERB handler"). Este codemod reconstruye esas rutas.
//
// Los tests mutating siguen en `test.fixme` (no se ejecutan sin body + dato + luz verde);
// esto solo hace la RUTA correcta y consistente con openapi.yaml.
//
// Uso: tsx scripts/fix-spec-routes.ts [--dry]

import path from 'node:path';
import { promises as fs } from 'node:fs';

type RouteCatalog = Record<string, Record<string, string>>;

const dry = process.argv.includes('--dry');
const specDir = path.resolve(import.meta.dirname, '..', 'tests', 'specs', 'controllers');
const catalogPath = path.resolve(import.meta.dirname, 'backend-route-catalog.json');

const METHOD_VERB: Record<string, string> = {
	getJson: 'GET',
	postJson: 'POST',
	putJson: 'PUT',
	deleteJson: 'DELETE',
	patchJson: 'PATCH'
};

/** Extrae el handler del título del test: "TS-API-TC023 — POST POST sendX []" → "sendX". */
function handlerFromTitle(title: string): string | null {
	const noTrailing = title.replace(/\[.*?\]\s*$/, '').trim();
	const tokens = noTrailing.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;
	const last = tokens[tokens.length - 1];
	// descartar títulos descriptivos (no camelCase handler)
	if (!/^[a-z][A-Za-z0-9]+$/.test(last)) return null;
	return last;
}

// Ruta "perdida" del stub: vacía, solo un path param, o solo query string (sin segmento).
const isEmptyPath = (p: string) => p === '' || /^\{[^}]*\}$/.test(p) || p.startsWith('?');

async function run(): Promise<void> {
	const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8')) as RouteCatalog;
	const files = (await fs.readdir(specDir)).filter((f) => f.endsWith('.ts'));

	let replaced = 0;
	let unmatched = 0;
	const unmatchedRefs: string[] = [];
	const touched: string[] = [];

	for (const file of files) {
		const full = path.join(specDir, file);
		const src = await fs.readFile(full, 'utf8');
		const lines = src.split('\n');

		const ctrl = src.match(/describe(?:\.serial)?\(\s*['"`]([A-Za-z]+Controller)/)?.[1];
		if (!ctrl || !catalog[ctrl]) continue;

		let currentTitle = '';
		let fileChanged = false;

		for (let i = 0; i < lines.length; i++) {
			const titleMatch = lines[i].match(/\btest(?:\.fixme|\.skip)?\(\s*['"`](.+?)['"`]/);
			if (titleMatch) currentTitle = titleMatch[1];

			const callMatch = lines[i].match(/\.(getJson|postJson|putJson|deleteJson|patchJson)\(\s*(['"`])(.*?)\2/);
			if (!callMatch) continue;
			const [, method, quote, currentPath] = callMatch;
			if (!isEmptyPath(currentPath)) continue;

			const handler = handlerFromTitle(currentTitle);
			const verb = METHOD_VERB[method];
			const route = handler ? catalog[ctrl][`${verb} ${handler}`] : undefined;
			if (!route) {
				unmatched++;
				unmatchedRefs.push(`${file}:${i + 1} · ${ctrl} · ${verb} ${handler ?? '(sin handler)'}`);
				continue;
			}
			// reemplaza SOLO el primer argumento string (la ruta)
			lines[i] = lines[i].replace(
				/\.(getJson|postJson|putJson|deleteJson|patchJson)\(\s*(['"`]).*?\2/,
				`.${method}(${quote}${route}${quote}`
			);
			replaced++;
			fileChanged = true;
		}

		if (fileChanged && !dry) {
			await fs.writeFile(full, lines.join('\n'), 'utf8');
			touched.push(file);
		}
	}

	console.log(`${dry ? '[DRY] ' : ''}rutas reemplazadas: ${replaced} · sin match en catálogo: ${unmatched}`);
	if (touched.length) console.log(`archivos tocados: ${touched.length}`);
	if (unmatchedRefs.length) {
		console.log('\nsin match (revisar manual):');
		for (const r of unmatchedRefs) console.log('  ' + r);
	}
}

await run();
