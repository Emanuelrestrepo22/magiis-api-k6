// tests/components/api/QuoteApi.ts
// KATA Architecture — Layer 3: componente del dominio Cotizaciones (QuoteController).
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - TRES ATCs de TM-1440 (MG-1601-AC5), uno por camino de cotización: quoteWeb, quote (createQuote) y
//     updateQuote. Cada uno envía el request real con un ítem de otros costos del tipo que NO corresponde y
//     espera 409 `OTHER_COST_RATE_TYPE_MISMATCH`. Comparten la misma key: ningún ATC llama a otro.
//   - `createCleanQuote` (setup) y `cancelQuote` (limpieza) son PÚBLICOS y SIN `@atc`: no son la acción bajo
//     prueba. `cancelQuote` = PUT quotes/quote/{id}/cancel (el spec lo corre en afterEach).
//   - `findPassengerUserId` es Discover (@step, silent fail) sobre `carriers/{id}/clients`.
//   - OJO con el contrato real: updateQuote es `POST quotes/quote/{quoteId}` (no PUT).

import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';
import { readJsonSafe } from '@helpers';
import type { TravelRequestBody } from '@data/f2';

export const OTHER_COST_RATE_TYPE_MISMATCH = 'OTHER_COST_RATE_TYPE_MISMATCH';

interface QuoteResponseBody {
	quoteId?: number;
	errorCode?: string;
	description?: string;
}

export class QuoteApi extends ApiBase {
	/**
	 * ATC (TM-1440, camino quoteWeb): POST quotes/quoteWeb con un ítem por costo sobre un pasajero con
	 * tarifador por venta.
	 * Fixed assertions: HTTP 409 y errorCode OTHER_COST_RATE_TYPE_MISMATCH.
	 */
	@atc('TM-1440', { description: 'quoteWeb con ítem del tipo equivocado — 409 sin persistir' })
	async createQuoteWebRejectsOtherCostMismatch(body: TravelRequestBody): Promise<APIResponse> {
		const res = await this.api.postJson('quotes/quoteWeb', body);
		await this.expectMismatch(res, 'quoteWeb');
		return res;
	}

	/**
	 * ATC (TM-1440, camino createQuote — iframe de cotización): POST quotes/quote con un ítem por costo.
	 * Fixed assertions: HTTP 409 y errorCode OTHER_COST_RATE_TYPE_MISMATCH.
	 */
	@atc('TM-1440', { description: 'createQuote con ítem del tipo equivocado — 409 sin persistir' })
	async createQuoteRejectsOtherCostMismatch(body: TravelRequestBody): Promise<APIResponse> {
		const res = await this.api.postJson('quotes/quote', body);
		await this.expectMismatch(res, 'createQuote');
		return res;
	}

	/**
	 * ATC (TM-1440, camino updateQuote): POST quotes/quote/{quoteId} sobre una cotización en estado QUOTE con
	 * un ítem por costo; el rechazo debe ser atómico (la cotización existente queda intacta: lo verifica el spec).
	 * Fixed assertions: HTTP 409 y errorCode OTHER_COST_RATE_TYPE_MISMATCH.
	 */
	@atc('TM-1440', { description: 'updateQuote con ítem del tipo equivocado — 409 sin cambios' })
	async updateQuoteRejectsOtherCostMismatch(quoteId: number, body: TravelRequestBody): Promise<APIResponse> {
		const res = await this.api.postJson(`quotes/quote/${quoteId}`, body);
		await this.expectMismatch(res, `updateQuote ${quoteId}`);
		return res;
	}

	/**
	 * Setup (SIN `@atc`): alta limpia de una cotización (otherCosts vacío). Fixed assertions: HTTP 200 y quoteId.
	 */
	async createCleanQuote(body: TravelRequestBody): Promise<number> {
		const res = await this.api.postJson('quotes/quote', body);
		const text = await res.text();
		expect(res.status(), `createQuote (setup) -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(200);
		const json = await readJsonSafe<QuoteResponseBody>(res);
		expect(json?.quoteId, 'createQuote (setup) debe devolver quoteId').toBeDefined();
		return json!.quoteId!;
	}

	/** Limpieza (SIN `@atc`): cancela una cotización — PUT quotes/quote/{id}/cancel. Fixed assertion: HTTP 200. */
	async cancelQuote(quoteId: number): Promise<APIResponse> {
		const res = await this.api.putJson(`quotes/quote/${quoteId}/cancel`, {});
		const text = await res.text();
		expect(res.status(), `cancelQuote ${quoteId} -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(200);
		return res;
	}

	/**
	 * Discover (silent fail): `passengerUserId` del cliente individual del carrier por nombre y apellido
	 * (`carriers/{id}/clients`). `null` si no existe o es ambiguo.
	 */
	@step
	async findPassengerUserId(carrierId: number, who: { firstName: string; lastName: string }): Promise<number | null> {
		const res = await this.api.getJson(`carriers/${carrierId}/clients`);
		if (res.status() !== 200) return null;
		const list = await readJsonSafe<Array<{ passengerUserId?: number; firstName?: string; lastName?: string }>>(res);
		if (!Array.isArray(list)) return null;
		const matches = list.filter(
			(c) =>
				typeof c.passengerUserId === 'number' &&
				(c.firstName ?? '').trim() === who.firstName &&
				(c.lastName ?? '').trim() === who.lastName
		);
		return matches.length === 1 ? matches[0].passengerUserId! : null;
	}

	private async expectMismatch(res: APIResponse, label: string): Promise<void> {
		const text = await res.text();
		expect(res.status(), `${label} -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(409);
		const json = await readJsonSafe<QuoteResponseBody>(res);
		expect(json?.errorCode, `${label} errorCode (cuerpo: ${text.slice(0, 300)})`).toBe(OTHER_COST_RATE_TYPE_MISMATCH);
	}
}
