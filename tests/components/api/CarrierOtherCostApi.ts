// tests/components/api/CarrierOtherCostApi.ts
// KATA Architecture — Layer 3: componente del dominio Otros costos del carrier (catálogo).
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - ATC de TM-1414 (MG-1601-AC4): el catálogo que consultan las apps del pasajero y del chofer
//     (`POST carriers/{carrierId}/otherCosts/search` con `apply` y SIN `rateByCost`).
//   - `searchCatalogue` es el CONTROL (AC3, sin `apply`: se comporta como el ABM) y es un `@step` sin `@atc`:
//     no es la acción bajo prueba del Test; el spec lo acredita solo a TM-1414 con `tms_only`.
//   - El oráculo (qué conceptos debe ofrecer) NO vive acá: lo lee el spec en vivo de `CARRIER_OTHER_COSTS`.

import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';
import { readJsonSafe } from '@helpers';

export type OtherCostApplyRole = 'PAX' | 'DRIVER';

/** Subconjunto de `OtherCostResponseDTO` que consume el contrato. */
export interface OtherCostItem {
	id: number;
	concept?: string;
	isByCost?: boolean;
	apply?: string[];
}

export class CarrierOtherCostApi extends ApiBase {
	/**
	 * ATC: consulta el catálogo con `apply` (PAX o DRIVER) y sin `rateByCost`; solo debe ofrecer conceptos por
	 * venta con ese rol en APPLY (la comparación contra la base la hace el spec).
	 * Fixed assertions:
	 *  - HTTP 200 y cuerpo array
	 *  - ningún concepto por costo (`isByCost`)
	 *  - todo concepto ofrecido declara el rol en `apply`
	 */
	@atc('TM-1414', { description: 'otherCosts/search con apply y sin rateByCost — solo ítems por venta' })
	async searchWithApplyWithoutRateByCost(carrierId: number, apply: OtherCostApplyRole): Promise<OtherCostItem[]> {
		const res = await this.postSearch(carrierId, { apply });
		const items = await this.readItems(res, `apply=${apply}`);
		expect(
			items.filter((i) => i.isByCost === true).map((i) => i.id),
			`apply=${apply}: no debe ofrecer conceptos por costo`
		).toEqual([]);
		expect(
			items.filter((i) => !(i.apply ?? []).includes(apply)).map((i) => i.id),
			`apply=${apply}: todo concepto ofrecido debe declarar ${apply} en apply`
		).toEqual([]);
		return items;
	}

	/**
	 * Control (SIN `@atc`): catálogo sin `apply` y sin `rateByCost`, igual que el ABM de Carrier V2.
	 * Fixed assertions: HTTP 200 y cuerpo array.
	 */
	@step
	async searchCatalogue(carrierId: number): Promise<OtherCostItem[]> {
		const res = await this.postSearch(carrierId, { apply: null });
		return this.readItems(res, 'sin apply');
	}

	private async postSearch(carrierId: number, args: { apply: OtherCostApplyRole | null }): Promise<APIResponse> {
		return this.api.postJson(`carriers/${carrierId}/otherCosts/search`, {
			carrierId: String(carrierId),
			name: '',
			type: '',
			apply: args.apply
		});
	}

	private async readItems(res: APIResponse, label: string): Promise<OtherCostItem[]> {
		const text = await res.text();
		expect(res.status(), `otherCosts/search ${label} -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toBe(200);
		const body = await readJsonSafe<OtherCostItem[]>(res);
		expect(Array.isArray(body), `otherCosts/search ${label}: el cuerpo debe ser un array`).toBe(true);
		return body as OtherCostItem[];
	}
}
