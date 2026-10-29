// scripts/generate-openapi-from-source.ts
// Genera un spec OpenAPI 3.0 LIMPIO directamente desde el CÓDIGO FUENTE de magiis-be
// (Spring Boot, Java 8). Reemplaza al pipeline basado en el snapshot Postman (IDs literales
// y prefijos truncados).
//
// Parsea, por cada *Controller.java:
//   @RestController + @RequestMapping("base")  → ruta base (puede tener {pathVars})
//   @GetMapping/@PostMapping/... ("sub")        → verbo + sub-ruta
//   public ResponseEntity<T> handler(...)       → operationId, params, requestBody, respuesta
// Resuelve los DTO/entity referenciados on-demand y transitivamente (dto/ + entities/).
//
// SOLO LECTURA sobre magiis-be. NO toca openapi.yaml.
//
// Uso:
//   BE_REPO="C:/ruta/a/magiis-be" tsx scripts/generate-openapi-from-source.ts
//   o: npm run generate:openapi:source
//
// Output: ./openapi.source.yaml (raíz del proyecto).

import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';

type Schema = Record<string, unknown>;

const DEFAULT_BE = "C:/Users/Erika/OneDrive - MAGIIS USA LLC (1)/Escritorio/magiis's_repos/magiis-be";
const beRepo = process.env.BE_REPO ?? DEFAULT_BE;
const srcRoot = path.join(beRepo, 'src/main/java/com/magiis/magiis');
const ctrlDir = path.join(srcRoot, 'controllers');
const dtoDir = path.join(srcRoot, 'dto');
const entitiesDir = path.join(srcRoot, 'entities');
const outputPath = path.resolve(import.meta.dirname, '..', 'openapi.source.yaml');

const VERB: Record<string, string> = {
	GetMapping: 'get',
	PostMapping: 'post',
	PutMapping: 'put',
	DeleteMapping: 'delete',
	PatchMapping: 'patch'
};

const SCALARS: Record<string, Schema> = {
	String: { type: 'string' },
	CharSequence: { type: 'string' },
	Character: { type: 'string' },
	char: { type: 'string' },
	Long: { type: 'integer', format: 'int64' },
	long: { type: 'integer', format: 'int64' },
	Integer: { type: 'integer', format: 'int32' },
	int: { type: 'integer', format: 'int32' },
	Short: { type: 'integer' },
	short: { type: 'integer' },
	Byte: { type: 'integer' },
	byte: { type: 'integer' },
	BigInteger: { type: 'integer' },
	Double: { type: 'number', format: 'double' },
	double: { type: 'number', format: 'double' },
	Float: { type: 'number', format: 'float' },
	float: { type: 'number', format: 'float' },
	BigDecimal: { type: 'number' },
	Boolean: { type: 'boolean' },
	boolean: { type: 'boolean' },
	Date: { type: 'string', format: 'date-time' },
	LocalDate: { type: 'string', format: 'date' },
	LocalDateTime: { type: 'string', format: 'date-time' },
	LocalTime: { type: 'string' },
	Instant: { type: 'string', format: 'date-time' },
	Timestamp: { type: 'string', format: 'date-time' },
	OffsetDateTime: { type: 'string', format: 'date-time' },
	ZonedDateTime: { type: 'string', format: 'date-time' },
	Calendar: { type: 'string', format: 'date-time' },
	UUID: { type: 'string', format: 'uuid' }
};

const LIST_BASES = [
	'List',
	'Set',
	'Collection',
	'Iterable',
	'ArrayList',
	'HashSet',
	'LinkedList',
	'LinkedHashSet',
	'SortedSet',
	'TreeSet'
];
const MAP_BASES = ['Map', 'HashMap', 'TreeMap', 'LinkedHashMap', 'SortedMap', 'ConcurrentHashMap'];

// ---------------------------------------------------------------------------
// Utilidades de parsing de Java
// ---------------------------------------------------------------------------

// Elimina comentarios de bloque y de línea respetando literales de string/char.
function stripComments(src: string): string {
	let out = '';
	let i = 0;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		const d = src[i + 1];
		if (c === '"') {
			out += c;
			i++;
			while (i < n) {
				const e = src[i];
				out += e;
				i++;
				if (e === '\\') {
					out += src[i] ?? '';
					i++;
					continue;
				}
				if (e === '"') break;
			}
			continue;
		}
		if (c === "'") {
			out += c;
			i++;
			while (i < n) {
				const e = src[i];
				out += e;
				i++;
				if (e === '\\') {
					out += src[i] ?? '';
					i++;
					continue;
				}
				if (e === "'") break;
			}
			continue;
		}
		if (c === '/' && d === '/') {
			while (i < n && src[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && d === '*') {
			i += 2;
			while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
			i += 2;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

// Lee desde s[start] (que es `open`) hasta el `close` balanceado. Devuelve el contenido interno.
function readBalanced(s: string, start: number, open: string, close: string): { inner: string; end: number } {
	let depth = 0;
	for (let i = start; i < s.length; i++) {
		const ch = s[i];
		if (ch === open) depth++;
		else if (ch === close) {
			depth--;
			if (depth === 0) return { inner: s.slice(start + 1, i), end: i + 1 };
		}
	}
	return { inner: s.slice(start + 1), end: s.length };
}

// Divide por comas de nivel superior, respetando <>, (), [], {}.
function splitTopLevel(s: string, sep: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of s) {
		if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
		else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') depth--;
		if (ch === sep && depth === 0) {
			parts.push(cur);
			cur = '';
		} else cur += ch;
	}
	if (cur.trim()) parts.push(cur);
	return parts.map((p) => p.trim()).filter(Boolean);
}

// Índice del primer `ch` a profundidad 0.
function topLevelIndexOf(s: string, ch: string): number {
	let depth = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '<' || c === '(' || c === '[' || c === '{') depth++;
		else if (c === '>' || c === ')' || c === ']' || c === '}') depth--;
		else if (c === ch && depth === 0) return i;
	}
	return -1;
}

// Extrae las rutas de un @*Mapping / @RequestMapping. Soporta forma array
// (value = { "a", "b" }): Spring mapea el handler a varias rutas alias.
// Prioriza value=/path=; ignora produces=/consumes=.
function mappingPaths(args: string): string[] {
	if (!args) return [''];
	let region = args;
	const vm = args.match(/(?:value|path)\s*=\s*/);
	if (vm) region = args.slice((vm.index ?? 0) + vm[0].length);
	else if (/=/.test(args)) return ['']; // solo produces/consumes/etc, sin ruta
	region = region.trim();
	if (region.startsWith('{')) {
		const strs = [...region.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
		return strs.length ? strs : [''];
	}
	const m = region.match(/"([^"]*)"/);
	return m ? [m[1]] : [''];
}

// Nombre declarado en una anotación @RequestParam/@PathVariable.
function annotationName(args: string): string {
	if (!args) return '';
	const vm = args.match(/(?:name|value|path)\s*=\s*"([^"]*)"/);
	if (vm) return vm[1];
	if (!/=/.test(args)) {
		const m = args.match(/"([^"]*)"/);
		return m ? m[1] : '';
	}
	return '';
}

function joinRoute(base: string, sub: string): string {
	const b = (base || '').replace(/^\/+|\/+$/g, '');
	const s = (sub || '').replace(/^\/+|\/+$/g, '');
	return [b, s].filter(Boolean).join('/');
}

// `Base<...>` → contenido interno (balanceado); null si no matchea.
function unwrapGeneric(type: string, base: string): string | null {
	const prefix = `${base}<`;
	if (type.startsWith(prefix) && type.endsWith('>')) return type.slice(prefix.length, -1);
	return null;
}

// ---------------------------------------------------------------------------
// Índice de tipos + resolución de schemas
// ---------------------------------------------------------------------------

const typeIndex = new Map<string, string>(); // simpleName → filepath
const fileCache = new Map<string, string>(); // filepath → source (sin comentarios)
const schemas = new Map<string, Schema>(); // components.schemas
const building = new Set<string>(); // rompe ciclos
let brokenTypeRefs = 0;
const unresolved = new Set<string>();

function listJava(dir: string): string[] {
	const out: string[] = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...listJava(p));
		else if (e.name.endsWith('.java')) out.push(p);
	}
	return out;
}

function buildTypeIndex(): void {
	const files: string[] = [];
	if (fs.existsSync(dtoDir)) files.push(...listJava(dtoDir));
	if (fs.existsSync(entitiesDir)) files.push(...listJava(entitiesDir));
	for (const f of files.sort()) {
		const simple = path.basename(f, '.java');
		if (!typeIndex.has(simple)) typeIndex.set(simple, f); // first-wins, determinista
	}
}

function readStripped(file: string): string {
	let cached = fileCache.get(file);
	if (cached === undefined) {
		cached = stripComments(fs.readFileSync(file, 'utf8'));
		fileCache.set(file, cached);
	}
	return cached;
}

function fileKind(name: string, src: string): 'enum' | 'class' {
	const m = src.match(new RegExp(`\\b(class|interface|enum)\\s+${name}\\b`));
	return m && m[1] === 'enum' ? 'enum' : 'class';
}

function enumSchema(name: string, src: string): Schema {
	const decl = src.search(new RegExp(`\\benum\\s+${name}\\b`));
	if (decl < 0) return { type: 'string' };
	const brace = src.indexOf('{', decl);
	if (brace < 0) return { type: 'string' };
	const { inner } = readBalanced(src, brace, '{', '}');
	const semi = topLevelIndexOf(inner, ';');
	const section = semi >= 0 ? inner.slice(0, semi) : inner;
	const values: string[] = [];
	for (const part of splitTopLevel(section, ',')) {
		const m = part.match(/^([A-Za-z_]\w*)/);
		if (m) values.push(m[1]);
	}
	return values.length ? { type: 'string', enum: values } : { type: 'string' };
}

function buildClassSchema(src: string): Schema {
	const properties: Record<string, Schema> = {};
	const required: string[] = [];
	// Campos: (private|protected|public) [modificadores] <Tipo> <nombre> ;|=
	const fieldRe = /\b(private|protected|public)\s+([^;=(){}]*?)\s+(\w+)\s*[;=]/g;
	let m: RegExpExecArray | null;
	while ((m = fieldRe.exec(src))) {
		const mods = m[2].trim();
		if (/\bstatic\b/.test(mods)) continue; // constantes, no campos de instancia
		const rawType = mods.replace(/\b(final|transient|volatile|native|synchronized)\b/g, '').trim();
		if (!rawType) continue;
		const fieldName = m[3];
		const schema = typeToSchema(rawType);
		properties[fieldName] = schema;
		// @NotNull / @NonNull / @NotBlank / @NotEmpty sobre el campo → required
		const head = src.slice(0, m.index);
		const boundary = Math.max(head.lastIndexOf(';'), head.lastIndexOf('{'), head.lastIndexOf('}'));
		const anns = src.slice(boundary + 1, m.index);
		if (/@(NotNull|NonNull|NotBlank|NotEmpty)\b/.test(anns)) required.push(fieldName);
	}
	const orderedProps: Record<string, Schema> = {};
	for (const k of Object.keys(properties).sort()) orderedProps[k] = properties[k];
	const schema: Schema = { type: 'object', properties: orderedProps };
	if (required.length) schema.required = [...new Set(required)].sort();
	return schema;
}

function resolveNamed(name: string): Schema {
	const file = typeIndex.get(name);
	if (!file) {
		brokenTypeRefs++;
		unresolved.add(name);
		return {}; // any
	}
	const src = readStripped(file);
	if (fileKind(name, src) === 'enum') return enumSchema(name, src);
	if (!schemas.has(name) && !building.has(name)) {
		building.add(name);
		const schema = buildClassSchema(src);
		schemas.set(name, schema);
		building.delete(name);
	}
	return { $ref: `#/components/schemas/${name}` };
}

function pageSchema(inner: string): Schema {
	return {
		type: 'object',
		properties: {
			content: { type: 'array', items: typeToSchema(inner) },
			number: { type: 'integer' },
			size: { type: 'integer' },
			totalElements: { type: 'integer', format: 'int64' },
			totalPages: { type: 'integer' }
		}
	};
}

function typeToSchema(rawType: string): Schema {
	let t = rawType.replace(/\s+/g, '');
	const opt = unwrapGeneric(t, 'Optional');
	if (opt !== null) t = opt;
	if (t.endsWith('[]')) return { type: 'array', items: typeToSchema(t.slice(0, -2)) };
	for (const base of LIST_BASES) {
		const inner = unwrapGeneric(t, base);
		if (inner !== null) return { type: 'array', items: typeToSchema(inner) };
	}
	for (const base of MAP_BASES) {
		if (unwrapGeneric(t, base) !== null) return { type: 'object' };
	}
	const page = unwrapGeneric(t, 'Page');
	if (page !== null) return pageSchema(page);
	const simple = t.includes('<') ? t.slice(0, t.indexOf('<')) : t;
	const base = simple.includes('.') ? simple.slice(simple.lastIndexOf('.') + 1) : simple;
	const scalar = SCALARS[base];
	if (scalar) return { ...scalar };
	if (['Object', 'Serializable', 'T', 'E', 'K', 'V', '?', ''].includes(base)) return {};
	return resolveNamed(base);
}

// ---------------------------------------------------------------------------
// Parsing de handlers de controllers
// ---------------------------------------------------------------------------

interface ParsedParam {
	kind: 'path' | 'query' | 'body' | 'ignore';
	name: string;
	type: string;
	required: boolean;
}

function parseParam(raw: string): ParsedParam {
	let rest = raw.trim();
	const annotations: { name: string; args: string }[] = [];
	while (rest.startsWith('@')) {
		const nameMatch = rest.match(/^@(\w+)/);
		if (!nameMatch) break;
		let idx = nameMatch[0].length;
		while (idx < rest.length && /\s/.test(rest[idx])) idx++;
		let args = '';
		if (rest[idx] === '(') {
			const b = readBalanced(rest, idx, '(', ')');
			args = b.inner;
			idx = b.end;
		}
		annotations.push({ name: nameMatch[1], args });
		rest = rest.slice(idx).trim();
	}
	rest = rest.replace(/^final\s+/, '').trim();
	const nm = rest.match(/(\w+)\s*$/);
	const javaName = nm ? nm[1] : '';
	const javaType = (nm ? rest.slice(0, rest.length - nm[0].length) : rest).trim();
	const ann = (n: string) => annotations.find((a) => a.name === n);

	if (ann('RequestBody')) return { kind: 'body', name: javaName, type: javaType, required: true };
	if (ann('PathVariable')) {
		const a = ann('PathVariable')!;
		return { kind: 'path', name: annotationName(a.args) || javaName, type: javaType, required: true };
	}
	if (ann('RequestParam')) {
		const a = ann('RequestParam')!;
		const isOptional = /^Optional</.test(javaType.replace(/\s+/g, ''));
		const hasRequiredFalse = /required\s*=\s*false/.test(a.args);
		const hasDefault = /defaultValue\s*=/.test(a.args);
		return {
			kind: 'query',
			name: annotationName(a.args) || javaName,
			type: javaType,
			required: !isOptional && !hasRequiredFalse && !hasDefault
		};
	}
	return { kind: 'ignore', name: javaName, type: javaType, required: false };
}

interface ParsedHandler {
	returnType: string;
	name: string;
	params: ParsedParam[];
}

// Parsea `public <ReturnType> handler(<params>)` a partir del índice de la anotación @*Mapping.
function parseHandler(src: string, fromIdx: number): ParsedHandler | null {
	const tail = src.slice(fromIdx);
	const pub = tail.search(/\bpublic\b/);
	if (pub < 0) return null;
	let i = pub + 'public'.length;
	const skipWs = () => {
		while (i < tail.length && /\s/.test(tail[i])) i++;
	};
	// salta anotaciones (@ResponseBody, @CrossOrigin, ...) y modificadores antes del tipo de retorno
	for (;;) {
		skipWs();
		if (tail[i] === '@') {
			const am = tail.slice(i).match(/^@\w+/);
			if (!am) break;
			i += am[0].length;
			skipWs();
			if (tail[i] === '(') i = readBalanced(tail, i, '(', ')').end;
			continue;
		}
		const kw = tail.slice(i).match(/^(final|static|synchronized|abstract|native|strictfp)\b/);
		if (kw) {
			i += kw[0].length;
			continue;
		}
		break;
	}
	// método genérico: public <T> ...
	if (tail[i] === '<') i = readBalanced(tail, i, '<', '>').end;
	skipWs();
	// tipo de retorno (identificador + genérico balanceado opcional + [] opcional)
	const typeStart = i;
	while (i < tail.length && /[\w.$]/.test(tail[i])) i++;
	let j = i;
	while (j < tail.length && /\s/.test(tail[j])) j++;
	if (tail[j] === '<') i = readBalanced(tail, j, '<', '>').end;
	let k = i;
	while (k < tail.length && /\s/.test(tail[k])) k++;
	if (tail[k] === '[' && tail[k + 1] === ']') i = k + 2;
	const returnType = tail.slice(typeStart, i).replace(/\s+/g, '');
	skipWs();
	const nameMatch = tail.slice(i).match(/^(\w+)/);
	if (!nameMatch) return null;
	const name = nameMatch[1];
	i += name.length;
	skipWs();
	if (tail[i] !== '(') return null;
	const { inner } = readBalanced(tail, i, '(', ')');
	const params = splitTopLevel(inner, ',').map(parseParam);
	return { returnType, name, params };
}

function responseContent(returnType: string): Schema | null {
	const inner = unwrapGeneric(returnType, 'ResponseEntity');
	if (inner === null) return null; // ResponseEntity crudo → sin schema
	if (inner === 'Void' || inner === 'void' || inner === '?' || inner === '') return null;
	const page = unwrapGeneric(inner, 'Page');
	if (page !== null) return pageSchema(page);
	return typeToSchema(inner);
}

// ---------------------------------------------------------------------------
// Ensamblado del documento OpenAPI
// ---------------------------------------------------------------------------

interface OpRecord {
	op: Schema;
	tag: string;
	handler: string;
}

function run(): void {
	if (!fs.existsSync(ctrlDir)) {
		throw new Error(`No se encontró el source de magiis-be en: ${ctrlDir}\nSeteá BE_REPO al repo local.`);
	}
	buildTypeIndex();

	const controllers = listJava(ctrlDir)
		.filter((f) => f.endsWith('Controller.java'))
		.sort();

	// pathKey → verb → OpRecord
	const paths = new Map<string, Map<string, OpRecord>>();
	let operationCount = 0;
	let controllerCount = 0;
	let skippedDup = 0;
	let skippedUnparsed = 0;

	for (const file of controllers) {
		const src = readStripped(file);
		const clsM = src.match(/\bclass\s+(\w+Controller)\b/);
		if (!clsM || clsM.index === undefined) continue;
		const tag = clsM[1].replace(/Controller$/, '');
		controllerCount++;

		const before = src.slice(0, clsM.index);
		const baseMatches = [...before.matchAll(/@RequestMapping\s*\(([^)]*)\)/g)];
		const base = baseMatches.length ? mappingPaths(baseMatches[baseMatches.length - 1][1])[0] : '';

		const mapRe = /@(Get|Post|Put|Delete|Patch)Mapping\b/g;
		let m: RegExpExecArray | null;
		while ((m = mapRe.exec(src))) {
			const verb = VERB[`${m[1]}Mapping`];
			let idx = m.index + m[0].length;
			while (idx < src.length && /\s/.test(src[idx])) idx++;
			let args = '';
			if (src[idx] === '(') args = readBalanced(src, idx, '(', ')').inner;
			const subs = mappingPaths(args);

			const handler = parseHandler(src, m.index);
			if (!handler) {
				skippedUnparsed++;
				continue;
			}

			// partes compartidas por todas las rutas alias del handler
			const queryParams: Schema[] = [];
			let requestBody: Schema | undefined;
			const pathTypeByName = new Map<string, string>();
			for (const p of handler.params) {
				if (p.kind === 'body') {
					requestBody = {
						required: true,
						content: { 'application/json': { schema: typeToSchema(p.type) } }
					};
				} else if (p.kind === 'path') {
					pathTypeByName.set(p.name, p.type);
				} else if (p.kind === 'query') {
					queryParams.push({
						name: p.name,
						in: 'query',
						required: p.required,
						schema: typeToSchema(p.type)
					});
				}
			}

			// @Deprecated del método → operation.deprecated. Se busca en la ventana que cubre
			// las anotaciones del método: desde ~60 chars antes del @*Mapping hasta el `public`.
			// (No se usa el corte por ;/} porque los {param} del path traen `}` dentro del string.)
			const pubIdx = src.indexOf('public', m.index);
			const isDeprecated = pubIdx > 0 && /@Deprecated\b/.test(src.slice(Math.max(0, m.index - 60), pubIdx));

			const content = responseContent(handler.returnType);
			const resp200: Schema = content
				? { description: 'OK', content: { 'application/json': { schema: content } } }
				: { description: 'OK' };

			// una operación por cada ruta alias (Spring permite value = { "a", "b" })
			for (const sub of subs) {
				const route = joinRoute(base, sub);
				const pathKey = `/${route}`;

				// path params desde los {..} de la ruta (tipo enriquecido con el @PathVariable)
				const pathParams: Schema[] = [];
				for (const braceVar of [...route.matchAll(/\{([^}]+)\}/g)].map((x) => x[1])) {
					const declType = pathTypeByName.get(braceVar);
					pathParams.push({
						name: braceVar,
						in: 'path',
						required: true,
						schema: declType ? typeToSchema(declType) : { type: 'string' }
					});
				}

				const parameters = [...pathParams, ...queryParams].sort((a, b) => String(a.name).localeCompare(String(b.name)));

				const op: Schema = { tags: [tag], operationId: handler.name };
				if (isDeprecated) op.deprecated = true;
				if (parameters.length) op.parameters = parameters;
				if (requestBody) op.requestBody = requestBody;
				op.responses = { '200': resp200, default: { description: 'Unexpected error' } };

				let verbMap = paths.get(pathKey);
				if (!verbMap) {
					verbMap = new Map<string, OpRecord>();
					paths.set(pathKey, verbMap);
				}
				if (verbMap.has(verb)) {
					skippedDup++;
					continue;
				}
				verbMap.set(verb, { op, tag, handler: handler.name });
				operationCount++;
			}
		}
	}

	// operationId único en todo el doc (spec requiere unicidad)
	const usedIds = new Set<string>();
	const sortedPathKeys = [...paths.keys()].sort();
	const pathsObj: Record<string, Record<string, Schema>> = {};
	for (const pk of sortedPathKeys) {
		const verbMap = paths.get(pk)!;
		const verbObj: Record<string, Schema> = {};
		for (const verb of [...verbMap.keys()].sort()) {
			const rec = verbMap.get(verb)!;
			let id = rec.handler;
			if (usedIds.has(id)) id = `${rec.tag}_${rec.handler}`;
			let suffix = 2;
			while (usedIds.has(id)) id = `${rec.tag}_${rec.handler}_${suffix++}`;
			usedIds.add(id);
			rec.op.operationId = id;
			verbObj[verb] = rec.op;
		}
		pathsObj[pk] = verbObj;
	}

	// components.schemas ordenados
	const schemasObj: Record<string, Schema> = {};
	for (const name of [...schemas.keys()].sort()) schemasObj[name] = schemas.get(name)!;

	let deprecatedCount = 0;
	for (const vObj of Object.values(pathsObj))
		for (const opv of Object.values(vObj)) if ((opv as Schema).deprecated) deprecatedCount++;

	const doc = {
		openapi: '3.0.0',
		info: {
			title: 'MAGIIS Backend API',
			version: '0.2.0',
			description:
				'Spec OpenAPI 3.0 generado desde el source de magiis-be v0.2 ' +
				'(parsing directo de @RestController/@*Mapping y DTO/entities del código fuente Java). ' +
				'Reemplaza al pipeline basado en el snapshot Postman.'
		},
		servers: [
			{ url: 'https://apps-test.example.com/magiis-v0.2', description: 'TEST (default)' },
			{ url: 'https://apps-uat.example.com/magiis-v0.2', description: 'UAT (staging)' },
			{ url: 'http://apps-dev2.example.com:8080/magiis-v0.2', description: 'DEV' }
		],
		security: [{ bearerAuth: [] }],
		paths: pathsObj,
		components: {
			securitySchemes: {
				bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
			},
			schemas: schemasObj
		}
	};

	const out = yaml.dump(doc, { noRefs: true, lineWidth: 120 });
	fs.writeFileSync(outputPath, out, 'utf8');

	console.log(
		[
			`OpenAPI source generado → ${path.basename(outputPath)}`,
			`  controllers : ${controllerCount}`,
			`  paths       : ${sortedPathKeys.length}`,
			`  operations  : ${operationCount}`,
			`  schemas     : ${Object.keys(schemasObj).length}`,
			`  deprecated  : ${deprecatedCount} operaciones (@Deprecated en el source)`,
			`  skipped     : ${skippedDup} dup (path+verb) · ${skippedUnparsed} sin handler parseable`,
			`  type refs no resueltos (→ any {}) : ${brokenTypeRefs} ocurrencias / ${unresolved.size} tipos únicos`,
			`    ${[...unresolved].sort().join(', ')}`
		].join('\n')
	);
}

run();
