// scripts/fetch-postman-collection.ts
// Descarga snapshot de MAGIIS-API desde Postman cloud a ./snapshots/MAGIIS-API.json
// Uso: POSTMAN_API_KEY=PMAK-... tsx scripts/fetch-postman-collection.ts

import { promises as fs } from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const COLLECTION_UID = '30637298-f51c27cc-cda6-4f2e-bb32-1793f1b6a70b'; // MAGIIS-API
const KEY = process.env.POSTMAN_API_KEY;

if (!KEY) {
	console.error('ERROR: POSTMAN_API_KEY missing in environment.');
	process.exit(2);
}

const outDir = path.resolve(import.meta.dirname, 'snapshots');
const outPath = path.join(outDir, 'MAGIIS-API.json');

await fs.mkdir(outDir, { recursive: true });

const data = await new Promise<string>((resolve, reject) => {
	https
		.get(`https://api.getpostman.com/collections/${COLLECTION_UID}`, { headers: { 'X-API-Key': KEY } }, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (c: Buffer) => chunks.push(c));
			res.on('end', () => {
				if (res.statusCode !== 200) {
					reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString().slice(0, 500)}`));
					return;
				}
				resolve(Buffer.concat(chunks).toString());
			});
		})
		.on('error', reject);
});

const parsed = JSON.parse(data) as { collection: unknown };
await fs.writeFile(outPath, JSON.stringify(parsed.collection, null, 2), 'utf8');
const stat = await fs.stat(outPath);
console.log(`OK saved ${outPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
