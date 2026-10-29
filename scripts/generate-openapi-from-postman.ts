// scripts/generate-openapi-from-postman.ts
// Convierte el snapshot Postman de MAGIIS-API a un spec OpenAPI 3.0 (YAML).
// Output: ./openapi.yaml en el root del proyecto.
//
// Uso: tsx scripts/generate-openapi-from-postman.ts
//   o: npm run generate:openapi

import path from 'node:path';
import { promises as fs } from 'node:fs';
import postmanToOpenApi from 'postman-to-openapi';
import { sanitizeSnapshot } from './sanitize-postman-snapshot';

// El snapshot crudo crashea postman-to-openapi (query vacíos + rutas perdidas).
// Saneamos primero y convertimos SOLO las requests convertibles.
const sanitized = await sanitizeSnapshot();
console.log(
	`Snapshot saneado: ${sanitized.kept}/${sanitized.total} magiis-be convertibles · ${sanitized.emptyQueryDropped} query vacíos removidos · ${sanitized.broken} rotas · ${sanitized.foreign} de otro servicio → ${path.basename(sanitized.brokenPath)}`
);

const inputPath = sanitized.sanitizedPath;
const outputPath = path.resolve(import.meta.dirname, '..', 'openapi.yaml');

const options = {
	defaultTag: 'General',
	info: {
		title: 'MAGIIS Backend API',
		version: '0.2.0',
		description: [
			'Spec OpenAPI 3.0 auto-generada desde la Postman collection MAGIIS-API',
			'(workspace MAGIIS-QA-API-v2). Backend ref: magiis-be release/v1.72.2 (API v0.2).',
			`Cobertura de este spec: ${sanitized.kept} de ${sanitized.total} requests del snapshot`,
			`(${sanitized.broken} rotas sin ruta + ${sanitized.foreign} de otros servicios excluidas`,
			'— ver scripts/snapshots/MAGIIS-API.broken.json y reconciliar contra la',
			'Documentacion Tecnica de Endpoints Backend Magiis, que mapea handler→ruta de los 767 endpoints).'
		].join(' ')
	},
	servers: [
		{ url: 'https://apps-test.example.com/magiis-v0.2', description: 'TEST (default)' },
		{ url: 'https://apps-uat.example.com/magiis-v0.2', description: 'UAT (staging)' },
		{ url: 'http://apps-dev2.example.com:8080/magiis-v0.2', description: 'DEV' }
	],
	auth: {
		bearerAuth: {
			type: 'http' as const,
			scheme: 'bearer' as const,
			bearerFormat: 'JWT'
		}
	},
	// postman-to-openapi@3 espera un array de nombres de variable a resolver;
	// sus .d.ts lo declaran mal como Record<string,string>. Runtime usa array.
	additionalVars: ['base_url', 'magiis'] as unknown as Record<string, string>,
	folderStrategy: 'Tags' as const,
	disabledParams: { includeQuery: false, includeHeader: false }
};

await fs.access(inputPath).catch(() => {
	throw new Error(`Snapshot Postman no encontrado: ${inputPath}\nCorré primero: npm run fetch:collection`);
});

await postmanToOpenApi(inputPath, outputPath, options);

const stat = await fs.stat(outputPath);
console.log(`OK saved ${outputPath} (${(stat.size / 1024).toFixed(2)} KB)`);
