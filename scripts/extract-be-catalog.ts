// scripts/extract-be-catalog.ts
// Extrae el catálogo de rutas (ground truth) desde el CÓDIGO FUENTE de magiis-be:
// parsea @RequestMapping (base) + @GetMapping/@PostMapping/@PutMapping/@DeleteMapping/@PatchMapping
// de cada *Controller.java y arma Controller -> "VERB handler" -> ruta efectiva.
//
// Fuente de verdad superior al snapshot Postman (que perdió rutas y usa IDs literales).
// Requiere el repo magiis-be clonado localmente.
//
// Uso:
//   BE_REPO="C:/ruta/a/magiis-be" tsx scripts/extract-be-catalog.ts
//   o: npm run catalog:from-be   (usa BE_REPO o el default de abajo)
//
// Output: scripts/backend-route-catalog.json (+ backend-dtos.json con el @RequestBody por endpoint).

import path from 'node:path';
import { promises as fs } from 'node:fs';

const DEFAULT_BE = "C:/Users/Erika/OneDrive - MAGIIS USA LLC (1)/Escritorio/magiis's_repos/magiis-be";
const beRepo = process.env.BE_REPO ?? DEFAULT_BE;
const ctrlDir = path.join(beRepo, 'src/main/java/com/magiis/magiis/controllers');
const catalogOut = path.resolve(import.meta.dirname, 'backend-route-catalog.json');
const dtosOut = path.resolve(import.meta.dirname, 'backend-dtos.json');

const VERB: Record<string, string> = {
	GetMapping: 'GET',
	PostMapping: 'POST',
	PutMapping: 'PUT',
	DeleteMapping: 'DELETE',
	PatchMapping: 'PATCH'
};

async function listControllers(dir: string): Promise<string[]> {
	let out: string[] = [];
	for (const e of await fs.readdir(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out = out.concat(await listControllers(p));
		else if (e.name.endsWith('Controller.java')) out.push(p);
	}
	return out;
}

function firstStringArg(args: string | undefined): string {
	if (!args) return '';
	const m = args.match(/(?:value|path)\s*=\s*"([^"]*)"/) ?? args.match(/"([^"]*)"/);
	return m ? m[1] : '';
}

function joinRoute(base: string, sub: string): string {
	const b = (base || '').replace(/^\/+|\/+$/g, '');
	const s = (sub || '').replace(/^\/+|\/+$/g, '');
	return [b, s].filter(Boolean).join('/');
}

async function run(): Promise<void> {
	await fs.access(ctrlDir).catch(() => {
		throw new Error(`No se encontró el source de magiis-be en: ${ctrlDir}\nSeteá BE_REPO al repo local.`);
	});

	const catalog: Record<string, Record<string, string>> = {
		_meta: {
			source: `magiis-be source (@RequestMapping/@*Mapping) — ${beRepo}`,
			purpose:
				'Controller -> "VERB handler" -> ruta efectiva. Ground truth para reparar el snapshot y validar openapi.yaml.',
			regenerate: 'npm run catalog:from-be (BE_REPO=<repo local>)'
		}
	};
	const dtos: Record<string, string> = {};
	let controllers = 0;
	let endpoints = 0;

	for (const file of (await listControllers(ctrlDir)).sort()) {
		const src = await fs.readFile(file, 'utf8');
		const clsM = src.match(/(?:public\s+)?class\s+(\w+Controller)\b/);
		if (!clsM || clsM.index === undefined) continue;
		const cls = clsM[1];

		const before = src.slice(0, clsM.index);
		const baseMatches = [...before.matchAll(/@RequestMapping\s*\(([^)]*)\)/g)];
		const base = baseMatches.length ? firstStringArg(baseMatches[baseMatches.length - 1][1]) : '';

		controllers++;
		catalog[cls] = catalog[cls] ?? {};

		const annRe = /@(Get|Post|Put|Delete|Patch)Mapping\s*(\(([^)]*)\))?/g;
		let m: RegExpExecArray | null;
		while ((m = annRe.exec(src))) {
			const verb = VERB[`${m[1]}Mapping`];
			const sub = firstStringArg(m[3]);
			const rest = src.slice(m.index, m.index + 600);
			const h = rest.match(/public\s+[^\n(]+?\s+(\w+)\s*\(/);
			if (!h) continue;
			const key = `${verb} ${h[1]}`;
			if (!(key in catalog[cls])) {
				catalog[cls][key] = joinRoute(base, sub);
				endpoints++;
			}
			const body = rest.match(/@RequestBody[^)]*?\s(\w+)\s+\w+/);
			if (body) dtos[`${cls}::${key}`] = body[1];
		}
	}

	// ordenar controllers y keys para diffs estables
	const ordered: Record<string, unknown> = { _meta: catalog._meta };
	for (const c of Object.keys(catalog)
		.filter((k) => k !== '_meta')
		.sort()) {
		const inner: Record<string, string> = {};
		for (const k of Object.keys(catalog[c]).sort()) inner[k] = catalog[c][k];
		ordered[c] = inner;
	}

	await fs.writeFile(catalogOut, `${JSON.stringify(ordered, null, '\t')}\n`, 'utf8');
	await fs.writeFile(dtosOut, `${JSON.stringify(dtos, null, '\t')}\n`, 'utf8');
	console.log(
		`Ground truth: ${controllers} controllers · ${endpoints} endpoints → ${path.basename(catalogOut)} (+ ${path.basename(dtosOut)})`
	);
}

await run();
