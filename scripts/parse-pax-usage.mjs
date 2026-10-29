// parse-pax-usage.mjs
// Best-effort static extraction of backend endpoints referenced by the pax app
// (magiis-mobile-passenger-v2). The pax app builds API URLs at the CALL SITES via
// `command.urlMapper(...segments)` (BaseCommandRequest.urlMapper sets
// `this.urlSections = args`). The command files themselves carry NO literal route,
// so routes are reconstructed by parsing every urlMapper(...) call and joining its
// string/template segments with '/'. Template `${...}` and bare expressions become
// `{}` (unknown param). Query segments (starting with '?') are dropped.
//
// Reconstructed routes are then normalized ({param}->{}, no query, no leading/trailing
// slash) and cross-checked against scripts/backend-route-catalog.json (ground truth
// from the BE source). READ-ONLY. No deps. Deterministic (all output sorted).
//
// Usage: node scripts/parse-pax-usage.mjs
//        node scripts/parse-pax-usage.mjs --json   (machine-readable dump)

import fs from 'node:fs';
import path from 'node:path';

// ---- config ---------------------------------------------------------------
const PAX_SRC = "C:/Users/Erika/OneDrive - MAGIIS USA LLC (1)/Escritorio/magiis's_repos/magiis-mobile-passenger-v2/src";
const CATALOG = path.resolve(process.argv[1], '../backend-route-catalog.json');
// base-command.request.ts holds the urlMapper *definition* (not a call site) -> skip.
const SKIP_FILES = new Set(['base-command.request.ts']);
// Keywords that make a bare literal string "look like" an API route (heuristic scan).
const ROUTE_KEYWORDS = [
	'passengers',
	'travels',
	'cards',
	'carriers',
	'quotes',
	'drivers',
	'vehicles',
	'preferences',
	'addresses',
	'users',
	'auth',
	'payments',
	'admins',
	'checkingAccount',
	'familyGroup',
	'multiregion',
	'data',
	'solicitude',
	'profiles',
	'contractors'
];
const emitJson = process.argv.includes('--json');

// ---- fs helpers -----------------------------------------------------------
function listTsFiles(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile()) continue;
		const name = entry.name;
		if (!name.endsWith('.ts')) continue;
		if (name.endsWith('.spec.ts') || name.endsWith('.d.ts')) continue;
		// Node returns parentPath (>=20). Fallback to path if absent.
		const parent = entry.parentPath ?? entry.path ?? dir;
		out.push(path.join(parent, name));
	}
	return out.sort();
}

// Strip comments while preserving line count (so line numbers stay accurate).
function stripComments(text) {
	// block comments -> blanks, keep newlines
	let t = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
	// line comments -> blank to EOL, but do NOT eat the '//' in '://' (URLs)
	t = t.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1);
	return t;
}

// Find the matching ')' for a '(' at openIdx (openIdx points just AFTER '('),
// respecting string/template state. Returns { inner, endIdx }.
function scanBalanced(text, openIdx) {
	let depth = 1;
	let i = openIdx;
	let quote = null; // "'", '"', or '`'
	let tmplBrace = 0; // inside `${ ... }`
	while (i < text.length) {
		const c = text[i];
		const prev = text[i - 1];
		if (quote) {
			if (c === '\\') {
				i += 2;
				continue;
			}
			if (quote === '`') {
				if (c === '`' && tmplBrace === 0) {
					quote = null;
				} else if (c === '$' && text[i + 1] === '{') {
					tmplBrace++;
					i += 2;
					continue;
				} else if (c === '}' && tmplBrace > 0) {
					tmplBrace--;
				}
			} else if (c === quote) {
				quote = null;
			}
			i++;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			quote = c;
			i++;
			continue;
		}
		if (c === '(') depth++;
		else if (c === ')') {
			depth--;
			if (depth === 0) return { inner: text.slice(openIdx, i), endIdx: i };
		}
		i++;
	}
	return { inner: text.slice(openIdx), endIdx: text.length }; // unbalanced (best-effort)
}

// Split a call's argument list on top-level commas.
function splitArgs(inner) {
	const args = [];
	let cur = '';
	let depthP = 0,
		depthB = 0,
		depthC = 0;
	let quote = null,
		tmplBrace = 0;
	for (let i = 0; i < inner.length; i++) {
		const c = inner[i];
		if (quote) {
			cur += c;
			if (c === '\\') {
				cur += inner[i + 1] ?? '';
				i++;
				continue;
			}
			if (quote === '`') {
				if (c === '`' && tmplBrace === 0) quote = null;
				else if (c === '$' && inner[i + 1] === '{') {
					tmplBrace++;
					cur += '{';
					i++;
				} else if (c === '}' && tmplBrace > 0) tmplBrace--;
			} else if (c === quote) quote = null;
			continue;
		}
		if (c === "'" || c === '"' || c === '`') {
			quote = c;
			cur += c;
			continue;
		}
		if (c === '(') depthP++;
		else if (c === ')') depthP--;
		else if (c === '[') depthB++;
		else if (c === ']') depthB--;
		else if (c === '{') depthC++;
		else if (c === '}') depthC--;
		if (c === ',' && depthP === 0 && depthB === 0 && depthC === 0) {
			args.push(cur);
			cur = '';
			continue;
		}
		cur += c;
	}
	if (cur.trim() !== '') args.push(cur);
	return args;
}

// Turn one argument into a path segment (literal kept; ${...}/bare expr -> {}).
function normalizeSegment(arg) {
	let s = arg.trim();
	if (s === '') return null;
	const q = s[0];
	if ((q === "'" || q === '"') && s[s.length - 1] === q) {
		return s.slice(1, -1);
	}
	if (q === '`' && s[s.length - 1] === '`') {
		return s.slice(1, -1).replace(/\$\{[^}]*\}/g, '{}');
	}
	// bare identifier / method call / numeric -> unknown param
	return '{}';
}

function lineOf(text, idx) {
	let line = 1;
	for (let i = 0; i < idx && i < text.length; i++) if (text[i] === '\n') line++;
	return line;
}

// Reconstruct a route from urlMapper segments.
function routeFromSegments(segments) {
	const parts = [];
	for (const seg of segments) {
		if (seg == null) continue;
		if (seg.startsWith('?')) break; // query begins -> stop path
		parts.push(seg);
	}
	let route = parts.join('/');
	route = route.split('?')[0]; // drop any embedded query
	route = route
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
		.replace(/\/{2,}/g, '/');
	return route;
}

// {param} -> {} ; strip query / slashes for comparison.
function normalizeRoute(r) {
	return r
		.replace(/\{[^}]*\}/g, '{}')
		.split('?')[0]
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
		.replace(/\/{2,}/g, '/');
}

// ---- load catalog ---------------------------------------------------------
const catalogRaw = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const catalogNorm = new Map(); // normalizedRoute -> Set("Controller.handler [VERB route]")
const catalogList = []; // { norm, segs, label } for loose matching
for (const [controller, handlers] of Object.entries(catalogRaw)) {
	if (controller === '_meta' || typeof handlers !== 'object' || handlers == null) continue;
	for (const [verbHandler, route] of Object.entries(handlers)) {
		if (typeof route !== 'string') continue;
		const norm = normalizeRoute(route);
		const label = `${controller}.${verbHandler.split(' ')[1] ?? verbHandler} [${verbHandler.split(' ')[0]} ${route}]`;
		if (!catalogNorm.has(norm)) catalogNorm.set(norm, new Set());
		catalogNorm.get(norm).add(label);
		catalogList.push({ norm, segs: norm.split('/'), label });
	}
}

// Loose match: same segment count; each position must be equal OR the catalog side
// is a {param} filled by a pax CONSTANT literal (e.g. 'PASSENGER' filling {appName}).
// Direction matters: a pax {} (runtime id) is NOT allowed to match a catalog literal
// keyword, since that would spuriously equate different resources. Deterministic.
function looseMatch(route) {
	const segs = route.split('/');
	const hits = [];
	for (const c of catalogList) {
		if (c.segs.length !== segs.length) continue;
		let ok = true;
		let filled = false; // require at least one real constant->param fill
		for (let i = 0; i < segs.length; i++) {
			if (segs[i] === c.segs[i]) continue; // identical segment
			if (c.segs[i] === '{}' && segs[i] !== '{}') {
				filled = true;
				continue;
			} // literal fills param
			ok = false;
			break; // any other divergence => no match
		}
		if (ok && filled) hits.push(c.label);
	}
	return [...new Set(hits)].sort();
}

// ---- scan pax src ---------------------------------------------------------
const files = listTsFiles(PAX_SRC);
const callSites = []; // {file, line, segments, route}
const literalHits = new Map(); // normalizedLiteral -> Set(files)

const reUrlMapper = /\burlMapper\s*\(/g;
const reStr = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

for (const file of files) {
	const base = path.basename(file);
	const raw = fs.readFileSync(file, 'utf8');
	const text = stripComments(raw);
	const relFile = path.relative(PAX_SRC, file).replace(/\\/g, '/');

	// (A) primary: urlMapper call sites
	if (!SKIP_FILES.has(base)) {
		reUrlMapper.lastIndex = 0;
		let m;
		while ((m = reUrlMapper.exec(text)) !== null) {
			const openIdx = m.index + m[0].length;
			const { inner, endIdx } = scanBalanced(text, openIdx);
			const args = splitArgs(inner);
			const segments = args.map(normalizeSegment);
			const route = routeFromSegments(segments);
			if (route === '') {
				reUrlMapper.lastIndex = endIdx;
				continue;
			}
			callSites.push({ file: relFile, line: lineOf(text, m.index), segments, route });
			reUrlMapper.lastIndex = endIdx;
		}
	}

	// (B) heuristic: standalone string literals that look like API routes
	reStr.lastIndex = 0;
	let s;
	while ((s = reStr.exec(text)) !== null) {
		const val = s[2];
		if (!val.includes('/')) continue;
		if (val.startsWith('http') || val.startsWith('//') || val.startsWith('./') || val.startsWith('../')) continue;
		if (!ROUTE_KEYWORDS.some((k) => val.includes(k))) continue;
		const norm = normalizeRoute(val.replace(/\$\{[^}]*\}/g, '{}'));
		if (norm === '') continue;
		if (!literalHits.has(norm)) literalHits.set(norm, new Set());
		literalHits.get(norm).add(relFile);
	}
}

// ---- aggregate ------------------------------------------------------------
const routeToSites = new Map();
for (const cs of callSites) {
	if (!routeToSites.has(cs.route)) routeToSites.set(cs.route, []);
	routeToSites.get(cs.route).push(cs);
}
const paxRoutes = [...routeToSites.keys()].map(normalizeRoute);
const distinctPaxRoutes = [...new Set(paxRoutes)].sort();

const matched = []; // exact normalized-route match
const looselyMatched = []; // {route, catalog[]} same shape, constant-fills-param
const unmatched = []; // genuinely absent from catalog
for (const r of distinctPaxRoutes) {
	if (catalogNorm.has(r)) {
		matched.push(r);
		continue;
	}
	const loose = looseMatch(r);
	if (loose.length > 0) looselyMatched.push({ route: r, catalog: loose });
	else unmatched.push(r);
}

// literal-scan routes that hit the catalog and are NOT already covered by urlMapper
const paxSet = new Set(distinctPaxRoutes);
const literalMatched = [...literalHits.keys()].filter((r) => catalogNorm.has(r) && !paxSet.has(r)).sort();

// deprecated / variant check for cards/app
const CARDS_APP_DEPRECATED = 'users/{}/cards/app/{}'; // CardController.getAllByUser @Deprecated
const CARDS_APP_PASSENGER = 'passengers/{}/cards/app/{}'; // CardController.getAllByPassenger (live)
const usesDeprecatedCardsApp = distinctPaxRoutes.includes(CARDS_APP_DEPRECATED);
const usesPassengerCardsApp = distinctPaxRoutes.includes(CARDS_APP_PASSENGER);

// ---- output ---------------------------------------------------------------
if (emitJson) {
	console.log(
		JSON.stringify(
			{
				filesScanned: files.length,
				urlMapperCallSites: callSites.length,
				distinctPaxRoutes: distinctPaxRoutes.length,
				matchedCount: matched.length,
				looselyMatchedCount: looselyMatched.length,
				unmatchedCount: unmatched.length,
				matched,
				looselyMatched,
				unmatched,
				literalMatched,
				cardsAppCheck: { usesDeprecatedCardsApp, usesPassengerCardsApp },
				routes: distinctPaxRoutes.map((r) => ({
					route: r,
					inCatalog: catalogNorm.has(r),
					catalog: catalogNorm.has(r) ? [...catalogNorm.get(r)].sort() : [],
					sites: (routeToSites.get(r) ?? []).map((c) => `${c.file}:${c.line}`)
				}))
			},
			null,
			2
		)
	);
} else {
	const line = '-'.repeat(72);
	console.log(line);
	console.log('PAX APP -> BACKEND ENDPOINT USAGE (best-effort, call-site reconstruction)');
	console.log(line);
	console.log(`Files .ts scanned                 : ${files.length}`);
	console.log(`urlMapper() call sites parsed     : ${callSites.length}`);
	console.log(`Distinct pax routes reconstructed : ${distinctPaxRoutes.length}`);
	console.log(`  -> EXACT match backend catalog  : ${matched.length}`);
	console.log(`  -> LOOSE match (const->param)   : ${looselyMatched.length}`);
	console.log(`  -> NOT in catalog (variant/gap) : ${unmatched.length}`);
	console.log(`  -> total mapped to catalog      : ${matched.length + looselyMatched.length}`);
	console.log(`Catalog routes (normalized)       : ${catalogNorm.size}`);
	console.log('');
	console.log(`[cards/app check]`);
	console.log(
		`  passengers/{}/cards/app/{} (live getAllByPassenger)  used by pax : ${usesPassengerCardsApp ? 'YES' : 'no'}`
	);
	console.log(
		`  users/{}/cards/app/{}      (@Deprecated getAllByUser) used by pax : ${usesDeprecatedCardsApp ? 'YES' : 'no'}`
	);
	console.log('');
	console.log(`EXACT MATCHED pax routes (${matched.length}):`);
	for (const r of matched) console.log(`  [OK]   ${r}`);
	console.log('');
	console.log(`LOOSE MATCH - constant literal fills a catalog {param} (${looselyMatched.length}):`);
	for (const lm of looselyMatched) console.log(`  [~]    ${lm.route}   =>   ${lm.catalog.join(' | ')}`);
	console.log('');
	console.log(`UNMATCHED reconstructed routes (${unmatched.length}) - variant vs catalog or catalog gap:`);
	for (const r of unmatched) {
		const sites = (routeToSites.get(r) ?? []).map((c) => `${c.file}:${c.line}`);
		console.log(`  [??]   ${r}   <- ${sites.join(', ')}`);
	}
	console.log('');
	console.log(`Literal path-like strings matching catalog (not already via urlMapper) (${literalMatched.length}):`);
	for (const r of literalMatched) console.log(`  [lit]  ${r}`);
	console.log(line);
}
