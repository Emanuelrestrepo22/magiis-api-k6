// tests/components/api/ContractorAccountApi.ts
// KATA Architecture — Layer 3: componente del dominio Cliente (ContractorAccount) vinculado a un carrier.
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - NO expone ningún ATC: acá no hay caso de prueba. Es la PREPARACIÓN de TM-1394 (límite de cuenta corriente):
//     leer la ficha del cliente y cambiar `checkingAccountLimit` / `exceedingLimit` de UNA cuenta corriente.
//     El ATC de TM-1394 es `TravelsApi.checkExceedingLimit`.
//
// POR QUÉ ES UNA MUTACIÓN DE DATO COMPARTIDO: el único camino de API que cambia el límite es
// `POST carrier/{carrierId}/updateCompany` con el `ContractorDTO` COMPLETO. Por eso el spec: (1) trabaja solo sobre un
// cliente propio de QA, (2) guarda el valor original, (3) lo restaura en `afterEach` y (4) verifica la restauración
// por DB. Este componente NO restaura solo: quien lo llama es responsable de hacerlo.
//
// DTO: `ContractorDTO` (openapi.yaml). `checkingAccounts[]` trae una cuenta por moneda; los campos de primer nivel
// `checkingAccountLimit` / `exceedingLimit` reflejan la cuenta del tarifador predeterminado (`defaultRate`). Se
// actualizan los dos para que el body siga siendo consistente con lo que envía la pantalla.

import { expect } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { step } from '@utils/decorators';
import { readJsonSafe } from '@helpers';

/** Cuenta corriente por moneda dentro de `ContractorDTO.checkingAccounts`. */
export interface ContractorCheckingAccount {
	checkingAccountId?: number;
	checkingAccountLimit?: number;
	exceedingLimit?: boolean;
	currencyId?: number;
	currencyCode?: string;
	defaultRate?: boolean;
	[key: string]: unknown;
}

/** `ContractorDTO` tal como lo devuelve el GET; los campos no tipados se reenvían intactos al `updateCompany`. */
export interface ContractorDto {
	id?: number;
	checkingAccountLimit?: number;
	exceedingLimit?: boolean;
	checkingAccounts?: ContractorCheckingAccount[];
	[key: string]: unknown;
}

export interface CheckingAccountLimitArgs {
	/** Ficha vigente del cliente (GET inmediatamente anterior). */
	contractor: ContractorDto;
	/** `CHECKINGACCOUNT.ID` de la cuenta a cambiar (las demás cuentas del cliente viajan sin cambios). */
	checkingAccountId: number;
	limit: number;
	exceedingLimit: boolean;
}

export class ContractorAccountApi extends ApiBase {
	/**
	 * Discover: ficha del cliente en el carrier (`GET contractor/{contractorAccountId}/carrier/{carrierId}`).
	 * Silent fail: `null` si no responde 200 o el cuerpo no es JSON.
	 */
	@step
	async getContractor(carrierId: number, contractorAccountId: number): Promise<ContractorDto | null> {
		const res = await this.api.getJson(`contractor/${contractorAccountId}/carrier/${carrierId}`);
		if (res.status() !== 200) return null;
		return readJsonSafe<ContractorDto>(res);
	}

	/**
	 * Acción de preparación — PÚBLICA y SIN decorar (NO es un ATC de ningún Test de Xray): cambia el límite y
	 * «Permite exceder» de UNA cuenta corriente del cliente reenviando la ficha completa a `updateCompany`. Si la
	 * cuenta es la del tarifador predeterminado, también ajusta los campos de primer nivel del DTO.
	 * Fixed assertions:
	 *  - la cuenta `checkingAccountId` figura en `contractor.checkingAccounts`
	 *  - HTTP 200 o 201 (openapi dice 200; el backend de TEST responde 201 sin cuerpo, medido el 21/10/2026)
	 */
	async setCheckingAccountLimit(carrierId: number, args: CheckingAccountLimitArgs): Promise<void> {
		const accounts = args.contractor.checkingAccounts ?? [];
		const target = accounts.find((a) => a.checkingAccountId === args.checkingAccountId);
		expect(target, `la cuenta corriente ${args.checkingAccountId} debe figurar en la ficha del cliente`).toBeDefined();
		const body: ContractorDto = {
			...args.contractor,
			// El GET devuelve `address: null` pero el POST lo rechaza con 400 (JSON parse error: address; medido el
			// 21/10/2026 en TEST). `address` no es columna de CONTRACTORACCOUNT (calle/ciudad van separadas y hoy están
			// vacías) y Oracle guarda '' como NULL, así que '' no altera el dato del cliente.
			address: args.contractor.address ?? '',
			checkingAccounts: accounts.map((a) =>
				a.checkingAccountId === args.checkingAccountId
					? { ...a, checkingAccountLimit: args.limit, exceedingLimit: args.exceedingLimit }
					: a
			)
		};
		if (target?.defaultRate) {
			body.checkingAccountLimit = args.limit;
			body.exceedingLimit = args.exceedingLimit;
		}
		const res = await this.api.postJson(`carrier/${carrierId}/updateCompany`, body);
		const text = await res.text();
		expect([200, 201], `updateCompany -> HTTP ${res.status()}: ${text.slice(0, 300)}`).toContain(res.status());
	}
}
