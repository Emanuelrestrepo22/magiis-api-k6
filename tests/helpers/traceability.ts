// tests/helpers/traceability.ts
// Helper de trazabilidad CANÓNICO del portafolio QA MAGIIS (contrato de consistencia).
//
// Contrato (alineado con el HUB agentic-qa-boilerplate y el xray-reporter):
//   - type:'tms' → key del Test de Xray/Jira (MG-XXXX). La consume el reporter.
//   - type:'tc'  → subcaso 1:1 con la matriz QA (MG-XXXX-<TC>).
//
// Sustituye a la convención `TS-API-TC###` declarada pero no aplicada: usar keys MG-XXXX.
//
// Uso:
//   import { makeAnnotate } from '@helpers/traceability';
//   const annotate = makeAnnotate('MX-5846');
//   test('EC-01 ...', async ({ magiisApi }) => { annotate('EC-01'); ... });

import { test } from '@playwright/test';

export type AnnotateFn = (tc: string) => void;

/**
 * Crea un annotador ligado a una key (MG-XXXX).
 * Empuja las annotations del contrato canónico en test.info().
 */
export function makeAnnotate(key: string): AnnotateFn {
	return (tc: string) => {
		const a = test.info().annotations;
		a.push({ type: 'tms', description: key }); // canónico — consumido por xray-reporter
		a.push({ type: 'tc', description: `${key}-${tc}` });
	};
}
