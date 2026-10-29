// scripts/parse-fe-usage.mjs
// Extrae los endpoints usados por los clientes FE con patrón Command (_commandUrl) y los cruza
// contra el catálogo de rutas del backend (scripts/backend-route-catalog.json).
// Segmenta magiis-fe por PORTAL (carrier/contractor/admin/owner/otros) para cerrar el mapa de uso.
// Pax (magiis-mobile-passenger-v2) usa call-site (urlSections=args) → no extraíble acá (ver parse-pax-usage.mjs).
//
// Uso: node scripts/parse-fe-usage.mjs [REPOS_BASE]
//   REPOS_BASE default: <Escritorio>/magiis's_repos

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..');
const REPOS_BASE = process.argv[2] ?? path.resolve(PROJECT, "../../magiis's_repos");

// ── Catálogo backend → set de rutas normalizadas + map ruta→controllers ──────────────
const catalog = JSON.parse(fs.readFileSync(path.join(PROJECT, 'scripts/backend-route-catalog.json'), 'utf8'));

function norm(route) {
	if (!route) return '';
	let r = String(route).trim();
	r = r.split('?')[0]; // sin query
	r = r.replace(/^\/+|\/+$/g, ''); // sin slashes borde
	r = r.replace(/\$\{[^}]*\}/g, '{}').replace(/\{[^}]*\}/g, '{}'); // params → {}
	r = r.replace(/:[A-Za-z0-9_]+/g, '{}'); // :param → {}
	r = r.replace(/\/{2,}/g, '/');
	return r;
}

const beRoutes = new Map(); // normRoute -> Set(controller)
for (const [ctrl, ops] of Object.entries(catalog)) {
	if (ctrl === '_meta' || typeof ops !== 'object') continue;
	for (const route of Object.values(ops)) {
		const n = norm(route);
		if (!n) continue;
		if (!beRoutes.has(n)) beRoutes.set(n, new Set());
		beRoutes.get(n).add(ctrl);
	}
}

// ── Extracción de _commandUrl de un repo ──────────────────────────────────────────────
const CMD_RE = /_commandUrl\s*[:=]\s*[`'"]([^`'"]+)[`'"]/g;

function walk(dir, acc = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return acc;
	}
	for (const e of entries) {
		if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
		const full = path.join(dir, e.name);
		if (e.isDirectory()) walk(full, acc);
		else if (/\.(ts|js)$/.test(e.name)) acc.push(full);
	}
	return acc;
}

function portalOf(fp) {
	const p = fp.replace(/\\/g, '/').toLowerCase();
	for (const seg of ['contractor', 'admin', 'owner', 'carrier']) {
		if (p.includes(`/app/${seg}/`) || p.includes(`/${seg}/`)) return seg;
	}
	return 'otros';
}

function extractRepo(repoDir) {
	const src = fs.existsSync(path.join(repoDir, 'src')) ? path.join(repoDir, 'src') : repoDir;
	const files = walk(src);
	// portal -> Set(normRoute)
	const byPortal = {};
	let rawCount = 0;
	for (const f of files) {
		const txt = fs.readFileSync(f, 'utf8');
		let m;
		CMD_RE.lastIndex = 0;
		while ((m = CMD_RE.exec(txt))) {
			rawCount++;
			const n = norm(m[1]);
			if (!n || n.startsWith('http')) continue;
			const portal = portalOf(f);
			(byPortal[portal] ??= new Set()).add(n);
		}
	}
	return { byPortal, rawCount, fileCount: files.length };
}

function matched(set) {
	const hit = new Set();
	for (const r of set) if (beRoutes.has(r)) hit.add(r);
	return hit;
}

// ── Repos a analizar ──────────────────────────────────────────────────────────────────
const REPOS = [
	{ key: 'magiis-fe (PROD, monolito)', dir: path.join(REPOS_BASE, 'magiis-fe'), split: true },
	{ key: 'magiis-fe-carrier-v2', dir: path.join(REPOS_BASE, 'magiis-fe-carrier-v2'), split: false },
	{ key: 'magiis-mobile-driver-v2', dir: path.join(REPOS_BASE, 'magiis-mobile-driver-v2'), split: false }
];

console.log(`Catálogo backend: ${beRoutes.size} rutas normalizadas únicas.\nREPOS_BASE: ${REPOS_BASE}\n`);

const unionUsed = new Set();
const portalContrib = {}; // portal -> Set(normRoute matched)

for (const repo of REPOS) {
	if (!fs.existsSync(repo.dir)) {
		console.log(`⚠ ${repo.key}: NO existe en ${repo.dir}`);
		continue;
	}
	const { byPortal, rawCount, fileCount } = extractRepo(repo.dir);
	console.log(`### ${repo.key}  (${fileCount} archivos, ${rawCount} _commandUrl crudos)`);
	if (repo.split) {
		for (const portal of ['carrier', 'contractor', 'admin', 'owner', 'otros']) {
			const set = byPortal[portal] ?? new Set();
			const hit = matched(set);
			for (const r of hit) {
				unionUsed.add(r);
				(portalContrib[portal] ??= new Set()).add(r);
			}
			console.log(
				`  - ${portal.padEnd(11)}: ${String(set.size).padStart(3)} rutas FE únicas → ${String(hit.size).padStart(3)} matchean backend`
			);
		}
	} else {
		const all = new Set();
		for (const s of Object.values(byPortal)) for (const r of s) all.add(r);
		const hit = matched(all);
		for (const r of hit) unionUsed.add(r);
		console.log(
			`  - total       : ${String(all.size).padStart(3)} rutas FE únicas → ${String(hit.size).padStart(3)} matchean backend`
		);
	}
	console.log('');
}

console.log('══════════════════════════════════════════════════════════');
console.log(
	`UNIÓN de endpoints backend USADOS (carrier×2 + contractor + admin + owner + driver): ${unionUsed.size} / ${beRoutes.size}`
);
console.log('');
console.log('Aporte incremental por portal de magiis-fe (rutas backend que el portal usa):');
for (const [portal, set] of Object.entries(portalContrib)) {
	console.log(`  - ${portal.padEnd(11)}: ${set.size} endpoints backend`);
}

// Endpoints backend NO usados por ningún cliente extraíble (candidatos dead-code; pax NO contado)
const unused = [...beRoutes.keys()].filter((r) => !unionUsed.has(r));
console.log('');
console.log(`Endpoints backend SIN uso extraíble (candidatos dead-code, EXCLUYE pax call-site): ${unused.length}`);
console.log('  (pax suma endpoints no contados aquí → el dead-code real es menor)');

// dump para el doc
const outDir = path.join(PROJECT, 'scripts');
fs.writeFileSync(
	path.join(outDir, 'fe-usage.generated.json'),
	JSON.stringify(
		{
			_meta: { generated: 'node scripts/parse-fe-usage.mjs', beRoutes: beRoutes.size, unionUsed: unionUsed.size },
			unionUsed: [...unionUsed].sort(),
			byPortal: Object.fromEntries(Object.entries(portalContrib).map(([k, v]) => [k, [...v].sort()])),
			unusedCandidates: unused.sort()
		},
		null,
		2
	)
);
console.log('\n→ scripts/fe-usage.generated.json escrito (gitignorable).');
