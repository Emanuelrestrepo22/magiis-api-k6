// scripts/gen-k6-endpoints.mjs
// Backlog C: derivar los endpoints GET read-only de k6 desde openapi.yaml en
// lugar de hardcodearlos. Solo LECTURA del spec; escribe un JSON determinista.
//
// Criterio de selección (fáciles de parametrizar desde env):
//   - Operación GET no `deprecated`.
//   - El path template SOLO tiene el path param {carrierId}, o bien no tiene
//     ningún path param (ej. config/serverInfo, multiregion/*). Los que tienen
//     otros params ({id}, {contractorId}, {from}, {to}, ...) se descartan porque
//     no hay un valor genérico seguro desde env.
//
// Salida: k6/lib/endpoints.generated.json = array de { path, name } ordenado
// por path (determinista). `path` conserva el literal {carrierId}; el consumidor
// (k6/read-sweep.js) lo reemplaza por config.carrierId en runtime.
//
// Ejecución:  node scripts/gen-k6-endpoints.mjs   (o: npm run k6:gen-endpoints)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import yaml from 'js-yaml';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const OPENAPI_PATH = resolve(repoRoot, 'openapi.yaml');
const OUT_PATH = resolve(repoRoot, 'k6', 'lib', 'endpoints.generated.json');

// Devuelve la lista de path params (nombres entre llaves) de un path template.
// Ej. '/carrier/{carrierId}/contractors/paginated' -> ['carrierId'].
function pathParams(pathTemplate) {
	const matches = pathTemplate.match(/\{([^}]+)\}/g) || [];
	return matches.map((m) => m.slice(1, -1));
}

// True si el path es parametrizable desde env: sin params, o solo {carrierId}.
function isParametrizable(params) {
	if (params.length === 0) return true;
	return params.length === 1 && params[0] === 'carrierId';
}

function main() {
	const raw = readFileSync(OPENAPI_PATH, 'utf8');
	const doc = yaml.load(raw);

	if (!doc || typeof doc.paths !== 'object' || doc.paths === null) {
		throw new Error(`openapi.yaml no tiene un objeto 'paths' válido: ${OPENAPI_PATH}`);
	}

	const endpoints = [];
	for (const [pathTemplate, item] of Object.entries(doc.paths)) {
		if (!item || typeof item !== 'object') continue;
		const getOp = item.get;
		if (!getOp || typeof getOp !== 'object') continue;
		if (getOp.deprecated === true) continue;

		const params = pathParams(pathTemplate);
		if (!isParametrizable(params)) continue;

		endpoints.push({
			// path canónico del spec (incluye leading slash y el literal {carrierId}).
			path: pathTemplate,
			// tag de baja cardinalidad para k6 (sin leading slash, template sin resolver).
			name: pathTemplate.replace(/^\//, '')
		});
	}

	// Orden determinista por path.
	endpoints.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

	writeFileSync(OUT_PATH, JSON.stringify(endpoints, null, '\t') + '\n', 'utf8');

	const noParam = endpoints.filter((e) => !e.path.includes('{carrierId}')).length;
	const carrierParam = endpoints.length - noParam;
	console.log(`[gen-k6-endpoints] openapi.yaml -> ${OUT_PATH}`);
	console.log(`[gen-k6-endpoints] endpoints generados: ${endpoints.length}`);
	console.log(`[gen-k6-endpoints]   sin path param    : ${noParam}`);
	console.log(`[gen-k6-endpoints]   solo {carrierId}  : ${carrierParam}`);
}

main();
