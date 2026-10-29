// tests/components/api/CarrierRateApi.ts
// KATA Architecture — Layer 3: componente del dominio CarrierRate.
// Piloto de conformidad KATA: demuestra el patrón componente + ATC del portafolio.
//   - extends ApiBase (L2) → hereda `this.api` (transporte) y `this.cfg` (runtime).
//   - método = ATC (acción + fixed assertions + return para encadenar).
//   - @atc('MG-XXXX') declara la trazabilidad al Test de Xray (reemplaza makeAnnotate).
//
// TRAZABILIDAD (⚠ pendiente de reasignar): CarrierRate read-only NO tiene key propia en la
// matriz QA del release gateway (idmap atp-mg-gateway = TCs de pago MG-141..MG-516). Se usa
// `@atc('MG-3')` (ancla del release, autorizada como fallback del piloto) SOLO como prueba de
// patrón. Cuando CarrierRate entre a la matriz QA, reasignar a su key MG real por endpoint.

import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';
import { expectArray, readJsonSafe } from '@helpers';

export interface CarrierRate {
	id?: number;
}

export class CarrierRateApi extends ApiBase {
	/** ATC: lista de tarifas del carrier — fixed assertion: shape array. */
	@atc('MG-3', { description: 'lista tarifas del carrier (shape array)' })
	async getRatesSuccessfully(carrierId: number): Promise<[APIResponse, CarrierRate[]]> {
		const res = await this.api.getJson(`carriers/rate/${carrierId}`, { params: { name: '' } });
		const list = await expectArray<CarrierRate>(res);
		return [res, list];
	}

	/** Discover (SIN `@atc`, silent fail): id de la tarifa del carrier cuyo nombre coincide exacto; `null` si no hay. */
	@step
	async findRateIdByName(carrierId: number, name: string): Promise<number | null> {
		const res = await this.api.getJson(`carriers/rate/${carrierId}`, { params: { name: '' } });
		if (res.status() !== 200) return null;
		const list = await readJsonSafe<Array<{ id?: number; name?: string }>>(res);
		if (!Array.isArray(list)) return null;
		const found = list.find((r) => r.name === name && typeof r.id === 'number');
		return found?.id ?? null;
	}

	/** ATC: tarifa default del carrier — puede no existir (tolerante 200/400/404). */
	async getDefaultRate(carrierId: number): Promise<APIResponse> {
		const res = await this.api.getJson(`carriers/rate/default/${carrierId}`);
		expect([200, 400, 404]).toContain(res.status());
		return res;
	}
}
