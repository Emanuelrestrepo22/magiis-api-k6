// tests/data/f2/observe.ts
// Registro del «comportamiento observado» de los contratos de API: adjunta al test (y por ende a
// `test-results/` y al reporte HTML) un JSON con el request enviado (SIN cabeceras ni tokens) y la
// respuesta. Es la fuente de los `red-*.json` de la evidencia por Test.

import fs from 'node:fs';
import path from 'node:path';
import type { APIResponse } from '@playwright/test';
import { test } from '@playwright/test';
import { markCallDone } from '@data/f2/pace';

export interface Observation {
	/** Endpoint lógico, p. ej. `POST carriers/1521/travels/simulateAll`. */
	endpoint: string;
	/** Única variación aplicada al request real. */
	variation: Record<string, unknown> | null;
	/** Body enviado (nunca incluir cabeceras ni Authorization). */
	sentBody?: unknown;
	status: number;
	response: unknown;
}

/** Lee el cuerpo de una respuesta como JSON, o como texto si no es JSON. */
export async function responseBody(res: APIResponse): Promise<unknown> {
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		return text.slice(0, 600);
	}
}

/** Carpeta local (sin versionar) donde se vuelcan los `red-*.json` de cada corrida. */
const OBSERVATIONS_DIR = path.resolve(process.cwd(), 'evidence', 'test', 'contrato-api');

/** Adjunta la observación como `red-<label>.json` al test en curso y la vuelca a `evidence/test/contrato-api/`. */
export async function observe(label: string, data: Observation): Promise<void> {
	markCallDone();
	const body = JSON.stringify(data, null, 1);
	await test.info().attach(`red-${label}.json`, { body, contentType: 'application/json' });
	fs.mkdirSync(OBSERVATIONS_DIR, { recursive: true });
	fs.writeFileSync(path.join(OBSERVATIONS_DIR, `red-${label}.json`), body, 'utf8');
}
