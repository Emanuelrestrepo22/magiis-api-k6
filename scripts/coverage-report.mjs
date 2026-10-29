// scripts/coverage-report.mjs
// Reporte de cobertura consolidado: cruza openapi.yaml (contrato, ground truth) contra
// los specs de test (qué endpoints se ejercen) y contra el uso de los FE (carrier x2 + driver).
// Output: docs/reference/coverage-report.md
//
// Uso: node scripts/coverage-report.mjs
// Sin deps de red ni backend. Determinista.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = path.resolve(import.meta.dirname, '..');

// normaliza una ruta: sin query, {param}->{}, ${..}->{}, sin barras extremas
const norm = (p) =>
	String(p)
		.split('?')[0]
		.trim()
		.replace(/\$\{[^}]*\}/g, '{}')
		.replace(/\{[^}]*\}/g, '{}')
		.replace(/^\/+|\/+$/g, '');

// ── 1. openapi ops (contrato) ──────────────────────────────────────────────
const doc = yaml.load(fs.readFileSync(path.join(ROOT, 'openapi.yaml'), 'utf8'));
const contract = new Set(); // "VERB norm(path)"
const contractByVerb = {};
for (const [p, verbs] of Object.entries(doc.paths || {})) {
	for (const v of Object.keys(verbs)) {
		const key = `${v.toUpperCase()} ${norm(p)}`;
		contract.add(key);
		contractByVerb[v.toUpperCase()] = (contractByVerb[v.toUpperCase()] || 0) + 1;
	}
}

// ── 2. endpoints ejercidos por los specs ───────────────────────────────────
const METHOD = { getJson: 'GET', postJson: 'POST', putJson: 'PUT', deleteJson: 'DELETE', patchJson: 'PATCH' };
function walk(d) {
	let out = [];
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const f = path.join(d, e.name);
		if (e.isDirectory()) out = out.concat(walk(f));
		else if (e.name.endsWith('.ts')) out.push(f);
	}
	return out;
}
const tested = new Set();
const callRe = /\.(getJson|postJson|putJson|deleteJson|patchJson)\(\s*(['"`])([^'"`]*)\2/g;
for (const f of walk(path.join(ROOT, 'tests/specs'))) {
	const src = fs.readFileSync(f, 'utf8');
	let m;
	while ((m = callRe.exec(src))) {
		const verb = METHOD[m[1]];
		const p = norm(m[3]);
		if (p) tested.add(`${verb} ${p}`);
	}
}

// ── 3. uso FE (union carrier x2 + driver) reusando catálogo normalizado ─────
const feUsed = new Set(); // norm(path) sin verbo (los FE no cruzan verbo por ruta fácil)
const REPOS = [
	"C:/Users/Erika/OneDrive - MAGIIS USA LLC (1)/Escritorio/magiis's_repos/magiis-fe/src",
	"C:/Users/Erika/OneDrive - MAGIIS USA LLC (1)/Escritorio/magiis's_repos/magiis-fe-carrier-v2/src",
	"C:/Users/Erika/OneDrive - MAGIIS USA LLC (1)/Escritorio/magiis's_repos/magiis-mobile-driver-v2/src"
];
for (const repo of REPOS) {
	if (!fs.existsSync(repo)) continue;
	for (const f of walk(repo)) {
		const src = fs.readFileSync(f, 'utf8');
		for (const mm of src.matchAll(/_commandUrl\s*[:=]\s*['"`]([^'"`]+)['"`]/g)) feUsed.add(norm(mm[1]));
	}
}
const contractPaths = new Set([...contract].map((k) => k.split(' ').slice(1).join(' ')));
const feUsedInContract = [...feUsed].filter((p) => contractPaths.has(p));

// ── 4. métricas ─────────────────────────────────────────────────────────────
const testedInContract = [...tested].filter((k) => contract.has(k));
const testedPaths = new Set([...tested].map((k) => k.split(' ').slice(1).join(' ')));
const feUsedTested = feUsedInContract.filter((p) => testedPaths.has(p));
const feUsedUntested = feUsedInContract.filter((p) => !testedPaths.has(p));

const byVerb = {};
for (const k of contract) {
	const verb = k.split(' ')[0];
	byVerb[verb] = byVerb[verb] || { total: 0, tested: 0 };
	byVerb[verb].total++;
	if (tested.has(k)) byVerb[verb].tested++;
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : '0') + '%';
const lines = [];
lines.push('# Reporte de cobertura — magiis-api-e2e', '');
lines.push('Generado por `node scripts/coverage-report.mjs` (determinista, sin backend).', '');
lines.push('Cruza `openapi.yaml` (contrato desde el source) × specs de test × uso de los FE.', '');
lines.push('## Cobertura de tests vs contrato', '');
lines.push(`- Operaciones del contrato: **${contract.size}**`);
lines.push(
	`- Ejercidas por algún spec (match verbo+ruta): **${testedInContract.length}** (${pct(testedInContract.length, contract.size)})`,
	''
);
lines.push('| Verbo | Contrato | Con test | % |');
lines.push('| --- | --- | --- | --- |');
for (const v of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
	const r = byVerb[v];
	if (r) lines.push(`| ${v} | ${r.total} | ${r.tested} | ${pct(r.tested, r.total)} |`);
}
lines.push('', '> Nota: la cobertura de mutación (POST/PUT/DELETE) vive en `tests/specs/_mutation/` (guarded).');
lines.push(
	'> La read-only (GET) en `tests/specs/controllers/`. Los tests tolerantes `[200,4xx]` cuentan como ejercidos.',
	''
);
lines.push('## Cobertura vs uso real de la plataforma (FE)', '');
lines.push(`- Endpoints usados por los FE carrier+driver (∩ contrato): **${feUsedInContract.length}**`);
lines.push(`- De esos, con test: **${feUsedTested.length}** (${pct(feUsedTested.length, feUsedInContract.length)})`);
lines.push(`- Usados por FE SIN test (gap prioritario): **${feUsedUntested.length}**`, '');
if (feUsedUntested.length) {
	lines.push('### Endpoints usados por FE sin cobertura (top 40)', '');
	for (const p of feUsedUntested.sort().slice(0, 40)) lines.push(`- ${p}`);
	lines.push('');
}
lines.push('## Método', '');
lines.push('- Contrato: paths×verbos de `openapi.yaml` (generado desde el source de magiis-be).');
lines.push('- Tested: llamadas `getJson/postJson/...` en `tests/specs/**`, normalizando `{param}`/`${..}`→`{}`.');
lines.push('- FE: `_commandUrl` de magiis-fe (prod) + carrier-v2 + driver-v2 (pax usa call-site, no incluido).');

const outPath = path.join(ROOT, 'docs/reference/coverage-report.md');
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(
	`contrato ${contract.size} · tested ${testedInContract.length} (${pct(testedInContract.length, contract.size)}) · FE-usados ${feUsedInContract.length} · FE-usados-con-test ${feUsedTested.length} · gap ${feUsedUntested.length}`
);
console.log('→ docs/reference/coverage-report.md');
