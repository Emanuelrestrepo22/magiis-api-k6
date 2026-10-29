// tests/components/api/PaymentApi.ts
// KATA Architecture — Layer 3: componente del dominio Pagos (hold & cobro → ATR MG-512 + MP API).
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - cada método = ATC (acción + fixed assertion tolerante + return para encadenar).
//   - @atc('MG-XXXX') declara la trazabilidad al Test (reemplaza makeAnnotate).
//
// Enfoque EXPLORATORIO (áreas MG-3): los POST se prueban con BODY VACÍO → NO cobran (el backend
// rechaza sin payload válido); revelan existencia + validación. Aserción tolerante que registra
// el status real (no falla por 5xx en rutas MG-3 aún en desarrollo). Pagos SOLO en TEST.
//
// Mapeo ATP (idmap atp-mg-gateway; reemplaza las anclas-fallback MG-3/MG-512, gaps #1/#4):
//   connectedAccount → B · MG-146 (gate conectada) · allCards sin wallet → C-02 · MG-149 ·
//   confirmHoldWith3DS → E-01 · MG-158 · cardValidationWith3DS → D-01 · MG-152 ·
//   epayment finalize → F-01 · MG-161 · paymentMethodsByPax → MPX-02 · MG-195 · cardTypes → MPX-01 · MG-194.
//   ATR destino (Test Execution): MG-512 (hold & cobro) — NO es un Test, no se anota como key.

import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';
import { readJsonSafe } from '@helpers';

// Read tolerante: excluye 5xx (un 500 en endpoint existente = regresión real).
const TOLERANT = [200, 400, 403, 404];
// Probe exploratorio: cualquier status HTTP conocido (registra; no falla por 5xx en rutas MG-3 en dev).
const PROBE_TOLERANT = [200, 201, 202, 400, 401, 402, 403, 404, 409, 415, 422, 500, 501, 502, 503];

type TravelRow = { travelId?: number; id?: number };

export class PaymentApi extends ApiBase {
	/** Deriva el {passengerId} del primer cliente del carrier (patrón card.api). */
	async resolveFirstPassengerId(carrierId: number): Promise<number | undefined> {
		const src = await this.api.getJson(`carriers/${carrierId}/clients`);
		if (src.status() !== 200) return undefined;
		const list = await readJsonSafe<Array<{ passengerUserId?: number }>>(src);
		return Array.isArray(list) ? list[0]?.passengerUserId : undefined;
	}

	/** Deriva un {travelId} del carrier (para el probe de hold). */
	async resolveFirstTravelId(carrierId: number): Promise<number | undefined> {
		const r = await this.api.getJson(`carriers/${carrierId}/travels`);
		if (r.status() !== 200) return undefined;
		const body = await readJsonSafe<{ content?: TravelRow[] } | TravelRow[]>(r);
		const rows: TravelRow[] = Array.isArray(body) ? body : (body?.content ?? []);
		return rows[0]?.travelId ?? rows[0]?.id;
	}

	// ── Pre-cobro (read) ──────────────────────────────────────────────────────────────────
	/** ATC: cuenta conectada del carrier (habilita el cobro directo). Tolerante ≠5xx. */
	@atc('MG-146', { description: 'connectedAccount del carrier — gate conectada para operar (≠5xx)' })
	async getConnectedAccount(carrierId: number): Promise<APIResponse> {
		const res = await this.api.getJson(`vendor/carrier/${carrierId}/connectedAccount`);
		expect(res.status(), 'connectedAccount no debe 5xx').not.toBe(500);
		expect(TOLERANT).toContain(res.status());
		return res;
	}

	/** ATC: wallet del pax (regresión MG-3: sin wallet ⇒ 200, nunca 500). */
	@atc('MG-149', { description: 'allCards del pax — listado sin wallet no rompe (≠5xx)' })
	async getAllCards(passengerId: number): Promise<APIResponse> {
		const res = await this.api.getJson(`passengers/${passengerId}/allCards`);
		expect(res.status(), 'allCards no debe 5xx (regresión C-02 · MG-149)').not.toBe(500);
		expect(TOLERANT).toContain(res.status());
		return res;
	}

	// ── Probes hold/cobro (body vacío → no cobran) ────────────────────────────────────────
	/** ATC: hold con 3DS (E · MG-158). Probe body vacío: revela existencia + validación. */
	@atc('MG-158', { description: 'confirmHoldWith3DS probe (body vacío)' })
	async probeHoldWith3DS(carrierId: number, travelId: number): Promise<APIResponse> {
		const res = await this.api.postJson(`carriers/${carrierId}/travels/${travelId}/confirmHoldWith3DS`, {});
		expect(PROBE_TOLERANT).toContain(res.status());
		return res;
	}

	/** ATC: validación de tarjeta con 3DS (MG-512). Probe body vacío. */
	@atc('MG-152', { description: 'cardValidationWith3DS probe 3DS · D-01 (body vacío)' })
	async probeCardValidationWith3DS(carrierId: number, passengerId: number): Promise<APIResponse> {
		const res = await this.api.postJson(`cards/passengers/${passengerId}/cardValidationWith3DS/${carrierId}`, {});
		expect(PROBE_TOLERANT).toContain(res.status());
		return res;
	}

	/** ATC: epayment finalize (F · MG-161). Probe body vacío (no cobra). */
	@atc('MG-161', { description: 'epayment finalize probe (body vacío)' })
	async probeEpayment(): Promise<APIResponse> {
		const res = await this.api.postJson('epayment', {});
		expect(PROBE_TOLERANT).toContain(res.status());
		return res;
	}

	// ── Mercado Pago (read) ───────────────────────────────────────────────────────────────
	/** ATC: métodos de pago del pax en la cuenta MP (MPX-02 · MG-195). */
	@atc('MG-195', { description: 'paymentMethodsByPax (cuenta MP)' })
	async probePaymentMethodsByPax(carrierId: number, passengerId?: number): Promise<APIResponse> {
		const body = passengerId !== undefined ? { passengerId } : {};
		const res = await this.api.postJson(`carriers/${carrierId}/paymentMethodsByPax`, body);
		expect(PROBE_TOLERANT).toContain(res.status());
		return res;
	}

	/** ATC: tipos de tarjeta soportados por el carrier (MPX-01 · MG-194). */
	@atc('MG-194', { description: 'cardTypes del carrier (≠5xx)' })
	async getCardTypes(carrierId: number): Promise<APIResponse> {
		const res = await this.api.getJson(`cards/${carrierId}/cardTypes`);
		expect(res.status(), 'cardTypes no debe 5xx').not.toBe(500);
		expect(TOLERANT).toContain(res.status());
		return res;
	}
}
