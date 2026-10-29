// scripts/generate-specs-from-postman.ts
// Genera 1 spec .api.test.ts por controller desde snapshot Postman.
// No sobreescribe specs ya editados manualmente (salvo --overwrite).
//
// Uso: tsx scripts/generate-specs-from-postman.ts [--input snapshots/MAGIIS-API.json] [--overwrite]

import { promises as fs } from 'node:fs';
import path from 'node:path';

type PostmanItem = {
	name: string;
	item?: PostmanItem[];
	request?: {
		method?: string;
		url?: { raw?: string; path?: string[] } | string;
	};
	event?: Array<{ listen: string; script?: { exec?: string[] } }>;
};
type PostmanCollection = { info: { name: string }; item: PostmanItem[] };

const args = process.argv.slice(2);
const overwrite = args.includes('--overwrite');
const inputIdx = args.indexOf('--input');
const inputPath = path.resolve(import.meta.dirname, inputIdx >= 0 ? args[inputIdx + 1] : 'snapshots/MAGIIS-API.json');
const outDir = path.resolve(import.meta.dirname, '..', 'tests', 'specs', 'controllers');

const toKebab = (s: string): string =>
	s
		.replace(/Controller$/, '')
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/[^a-zA-Z0-9-]/g, '-')
		.replace(/--+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase();

const extractTcIds = (lines: string[] | undefined): string[] => {
	if (!lines) return [];
	for (const l of lines) {
		const m = l.match(/Mapped TCs[^:]*:\s*([\w\-,\s]+)/i);
		if (m)
			return m[1]
				.split(',')
				.map((x) => x.trim())
				.filter((x) => /^TS-API-TC\d+$/.test(x));
	}
	return [];
};

const pathFromReq = (req: NonNullable<PostmanItem['request']>): string => {
	if (typeof req.url === 'string') return req.url.replace(/\{\{[^}]+\}\}/g, '').replace(/^\/+/, '');
	if (req.url?.path) return req.url.path.filter((p) => !/^\{\{.+\}\}$/.test(p)).join('/');
	if (req.url?.raw) return req.url.raw.replace(/\{\{[^}]+\}\}/g, '').replace(/^\/+/, '');
	return '';
};

const walk = (items: PostmanItem[], ctrl: string[] = []): Array<{ folder: string; req: PostmanItem }> => {
	const out: Array<{ folder: string; req: PostmanItem }> = [];
	for (const it of items) {
		if (it.item) out.push(...walk(it.item, [...ctrl, it.name]));
		else if (it.request) out.push({ folder: ctrl[0] ?? 'Misc', req: it });
	}
	return out;
};

const buildSpec = (ctrl: string, reqs: PostmanItem[]): string => {
	const lines: string[] = [
		`// tests/specs/controllers/${toKebab(ctrl)}.api.test.ts`,
		`// DRAFT auto-generado · Controller: ${ctrl} · ${reqs.length} reqs`,
		'',
		`import { test, expect } from '../../TestBase';`,
		'',
		`test.describe('${ctrl}', () => {`
	];
	for (const r of reqs) {
		const method = (r.request?.method ?? 'GET').toUpperCase();
		const reqPath = pathFromReq(r.request!);
		const tcs = extractTcIds(r.event?.find((e) => e.listen === 'test')?.script?.exec);
		const prefix = tcs.length ? `${tcs[0]} — ` : '';
		const safeName = r.name.replace(/'/g, "\\'");
		const fixme =
			method !== 'GET' ? `\t\ttest.fixme(true, 'Mutating ${method} — validar antes de quitar fixme');\n` : '';
		const call =
			method === 'GET'
				? `magiisApi.getJson('${reqPath}')`
				: method === 'POST'
					? `magiisApi.postJson('${reqPath}', { /* TODO body */ })`
					: method === 'PUT'
						? `magiisApi.putJson('${reqPath}', { /* TODO body */ })`
						: method === 'DELETE'
							? `magiisApi.deleteJson('${reqPath}')`
							: `magiisApi.patchJson('${reqPath}', { /* TODO body */ })`;
		const safePath = reqPath.replace(/'/g, "\\'");
		lines.push(
			`\ttest('${prefix}${method} ${safeName} [${safePath}]', async ({ magiisApi }) => {`,
			fixme,
			`\t\tconst r = await ${call};`,
			`\t\texpect([200, 201, 204, 400, 404]).toContain(r.status());`,
			`\t});`,
			''
		);
	}
	lines.push('});', '');
	return lines.join('\n');
};

const main = async (): Promise<void> => {
	const raw = await fs.readFile(inputPath, 'utf8');
	const coll = JSON.parse(raw) as PostmanCollection;
	const flat = walk(coll.item);
	const byCtrl = new Map<string, PostmanItem[]>();
	for (const { folder, req } of flat) {
		if (folder === '_FLOWS_' || folder === '__EXTERNAL_APIS__' || folder === '_LEGACY_UNMATCHED_') continue;
		if (!byCtrl.has(folder)) byCtrl.set(folder, []);
		byCtrl.get(folder)!.push(req);
	}
	await fs.mkdir(outDir, { recursive: true });
	let written = 0;
	let skipped = 0;
	for (const [ctrl, reqs] of byCtrl) {
		const fp = path.join(outDir, `${toKebab(ctrl)}.api.test.ts`);
		try {
			await fs.access(fp);
			if (!overwrite) {
				console.log(`SKIP (exists): ${path.basename(fp)}`);
				skipped++;
				continue;
			}
		} catch {
			/* not exists */
		}
		await fs.writeFile(fp, buildSpec(ctrl, reqs), 'utf8');
		console.log(`WROTE: ${path.basename(fp)}  (${reqs.length} tests)`);
		written++;
	}
	console.log(`\nDone. wrote=${written} skipped=${skipped} controllers=${byCtrl.size}`);
};

await main();
