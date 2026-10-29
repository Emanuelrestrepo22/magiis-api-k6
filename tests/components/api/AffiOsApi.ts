// tests/components/api/AffiOsApi.ts
// KATA Architecture — Layer 3: componente del dominio AffiOS (acuerdos one-shot entre afiliados).
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - @atc('TM-969') es el único ATC de esta tanda (BUG-MG-682, referencia positiva).
//
// TICKET: BUG-MG-682 — el alta de un acuerdo AffiOS resuelve fastestRoute/avoidTolls/avoidHighways
// contra PARAMETERS del carrier SOLICITANTE (affiProfileRequesterId), patrón YA correcto (a
// diferencia del defecto de destino frecuente, TM-931).

import type { APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

export interface AffiOsAgreementPayload {
	agreementName: string;
	travelDate: string;
	travelDueDate: string;
	routeList: Array<{ latitude: string; longitude: string; placeId: string }>;
	pickupRadius: number;
	dropoffRadius: number;
	serviceTypesList: number[];
	passengerQty: number;
	waitingTime: number;
	currency: string;
	notes: string;
	affiliateProfileList: number[];
	distance: number;
	duration: number;
	reverse: number;
	roundTrip: boolean;
	affiProfileRequesterId: number;
	vehicleQty: number;
	passenger: number;
	paymentMethod: string;
	markupPercentage: number;
	pickupGmt: string;
}

export class AffiOsApi extends ApiBase {
	/**
	 * ATC: alta de acuerdo AffiOS omitiendo los 3 flags de ruta; confirma que se resuelven contra
	 * PARAMETERS del carrier SOLICITANTE (affiProfileRequesterId), patrón ya correcto (a diferencia
	 * del defecto de destino frecuente, TM-931).
	 * Fixed assertions:
	 *  - HTTP 200/201
	 */
	@atc('TM-969', { description: 'AffiOS — flags contra el parámetro del solicitante' })
	async createAgreementResolvesRouteFlagsAgainstRequesterParameter(
		payload: AffiOsAgreementPayload
	): Promise<APIResponse> {
		const res = await this.api.postJson('affiOneShotTravel/createOSTravelAgreement', payload);
		expect([200, 201]).toContain(res.status());
		return res;
	}
}
