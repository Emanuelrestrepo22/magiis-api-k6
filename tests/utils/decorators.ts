// tests/utils/decorators.ts
// KATA Architecture — @atc / @step (decoradores TC39 Stage 3).
//
// Portado (adaptado) del HUB agentic-qa-boilerplate. Reemplaza el helper imperativo
// `makeAnnotate` (@helpers/traceability) por trazabilidad declarativa a nivel de método:
// el @atc en un ATC de un componente enlaza ese mini-flujo con su Test de Xray (MG-XXXX).
//
// Contrato de consistencia del portafolio (idéntico al que consume el xray-reporter):
//   - Empuja annotation { type:'tms', description:'MG-XXXX' } en test.info() → binding
//     determinístico spec ↔ Test de Xray (ver tests/utils/reporters/xray-reporter.ts).
//   - Envuelve el método en test.step(...) para trazas legibles en el reporter.
//
// Runtime: decoradores TC39 Stage 3 (NO `experimentalDecorators`). tsconfig target ES2022
// + TypeScript 5.7 los tipa de forma nativa. La ejecución bajo tsx/Playwright usa la firma
// `ClassMethodDecoratorContext`; si el runner no soportara decoradores standard, el error
// se reporta y NO se fuerza (el typecheck con tsc --noEmit valida el tipado igualmente).

import { test } from '@playwright/test';

export interface AtcOptions {
	/** Descripción opcional del ATC (documental; visible en el título del step). */
	description?: string;
}

// Tipo de annotation que porta la key del Test (canónico — prioridad 1 en el reporter).
const TMS_ANNOTATION = 'tms';

/**
 * @atc — marca un método de componente como Acceptance Test Case y lo enlaza con su
 * Test de Xray (MG-XXXX). Uso en L3 (componentes de dominio), sobre el método = mini-flujo
 * (acción + fixed assertions).
 *
 * @example
 * ⁣@atc('MG-158')
 * async holdWith3DSSuccessfully(travelId: number): Promise<APIResponse> { ... }
 */
export function atc(testId: string, options: AtcOptions = {}) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- firma genérica de decorador
	return function <T extends (...args: any[]) => Promise<any>>(
		originalMethod: T,
		context: ClassMethodDecoratorContext
	): T {
		const methodName = String(context.name);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- respeta la firma T
		async function replacement(this: unknown, ...args: any[]) {
			// Trazabilidad canónica: bind ATC → Test de Xray (dedup por key).
			const annotations = test.info().annotations;
			if (!annotations.some((a) => a.type === TMS_ANNOTATION && a.description === testId)) {
				annotations.push({ type: TMS_ANNOTATION, description: testId });
			}
			const label = options.description ? `${methodName} — ${options.description}` : methodName;
			return test.step(`ATC [${testId}]: ${label}`, async () => originalMethod.apply(this, args));
		}

		return replacement as T;
	};
}

/**
 * @step — envuelve un helper de L3 (query read-only) en test.step para trazas legibles.
 * NO usar sobre métodos @atc ni sobre la base L2.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- firma genérica de decorador
export function step<T extends (...args: any[]) => Promise<any>>(
	originalMethod: T,
	context: ClassMethodDecoratorContext
): T {
	const methodName = String(context.name);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- respeta la firma T
	async function replacement(this: unknown, ...args: any[]) {
		return test.step(methodName, async () => originalMethod.apply(this, args));
	}

	return replacement as T;
}
