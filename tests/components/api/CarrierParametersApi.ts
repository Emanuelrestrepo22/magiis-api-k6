// tests/components/api/CarrierParametersApi.ts
// KATA Architecture — Layer 3: componente del dominio Parámetros del carrier.
//   - extends ApiBase (L2) → hereda `this.api` (transporte MagiisApiClient) y `this.cfg` (runtime).
//   - NO expone ningún ATC: acá no hay caso de prueba, solo Discover. Todos sus métodos son
//     utilidades `@step` con silent fail (devuelven `null`), porque su rol es alimentar el ORÁCULO
//     de los casos de MG-682, no ser el sujeto de prueba de ninguno.
//
// POR QUÉ EXISTE (MG-682): el criterio de aceptación de TM-930/932/933/934/945 es "el flag
// persistido resuelve contra `PARAMETERS` del carrier". El valor esperado, entonces, es un DATO
// DEL ENTORNO — no una constante. La primera vuelta de la campaña lo hardcodeaba (1 para el
// carrier 1521 de TEST, 0 para el 1040), lo que rompe al cambiar de entorno y obliga a editar
// specs para correr en producción. `GET /carriers/{carrierId}/parameters` devuelve los tres flags,
// así que el esperado se LEE en vivo del mismo backend bajo prueba.
//
// Esto NO vuelve tautológica la aserción: `PARAMETERS` (lo que el carrier configuró) y
// `FREQUENTDESTINATION` / `TRAVEL` / `MAGIIS_ROUTES` (lo que el mapper persistió al procesar la
// request) son fuentes distintas. El bug MG-682 es precisamente que la segunda no reflejaba a la
// primera.
//
// DERIVA DE CONTRATO (verificada contra producción el 2026-09-09): `openapi.yaml` declara la
// respuesta como página (`{ content: [...] }`), pero el backend responde el OBJETO PLANO
// `CarrierParametersResponseDTO`. Se aceptan las dos formas y se documenta la deriva acá en vez de
// romper cuando el contrato se corrija.

import { ApiBase } from '@api/ApiBase';
import { step } from '@utils/decorators';
import { readJsonSafe } from '@helpers';
import type { RouteFlagName } from '@data/mg682';

/** Subconjunto de `CarrierParametersResponseDTO` que consume MG-682. */
export interface CarrierRouteFlagParameters {
	avoidTolls: boolean;
	avoidHighways: boolean;
	fastestRoute: boolean;
}

/** Parámetros operativos que condicionan qué es seguro ejecutar contra un entorno productivo. */
export interface CarrierOperationalParameters {
	/** `true` = al dar de alta un viaje se asigna un conductor de inmediato. */
	instantAssignment: boolean;
	/** `true` = el carrier despacha automáticamente el viaje a sus conductores. */
	autodispatchCarrier: boolean;
	/** `true` = el carrier admite cancelar viajes (condiciona la limpieza post-alta). */
	travelCancellation: boolean;
}

interface CarrierParametersDTO {
	avoidTolls?: boolean;
	avoidHighways?: boolean;
	fastestRoute?: boolean;
	instantAssignment?: boolean;
	autodispatchCarrier?: boolean;
	travelCancellation?: boolean;
}

export class CarrierParametersApi extends ApiBase {
	/**
	 * Discover: lee el DTO de parámetros del carrier tolerando las dos formas de respuesta
	 * (objeto plano — la real — y página `{ content: [...] }` — la declarada en openapi.yaml).
	 * Silent fail: `null` si el endpoint no responde 200 o el cuerpo no trae los flags.
	 */
	@step
	async readParameters(carrierId: number): Promise<CarrierParametersDTO | null> {
		const res = await this.api.getJson(`carriers/${carrierId}/parameters`);
		if (res.status() !== 200) return null;
		const body = await readJsonSafe<CarrierParametersDTO | { content?: CarrierParametersDTO[] }>(res);
		if (!body || typeof body !== 'object') return null;
		const page = body as { content?: CarrierParametersDTO[] };
		return Array.isArray(page.content) ? (page.content[0] ?? null) : (body as CarrierParametersDTO);
	}

	/**
	 * Discover: los tres flags de ruta configurados por el carrier — el ESPERADO de MG-682.
	 * Silent fail: `null` si alguno de los tres no viene booleano (contrato incompleto ⇒ el spec
	 * decide skipear en vez de asumir un valor).
	 */
	@step
	async readRouteFlagParameters(carrierId: number): Promise<CarrierRouteFlagParameters | null> {
		const dto = await this.readParameters(carrierId);
		if (!dto) return null;
		const { avoidTolls, avoidHighways, fastestRoute } = dto;
		if (typeof avoidTolls !== 'boolean' || typeof avoidHighways !== 'boolean' || typeof fastestRoute !== 'boolean') {
			return null;
		}
		return { avoidTolls, avoidHighways, fastestRoute };
	}

	/**
	 * Discover: parámetros operativos que deciden si un alta de viaje es segura y reversible en el
	 * entorno activo. Silent fail: `null` si el contrato no los trae completos.
	 */
	@step
	async readOperationalParameters(carrierId: number): Promise<CarrierOperationalParameters | null> {
		const dto = await this.readParameters(carrierId);
		if (!dto) return null;
		const { instantAssignment, autodispatchCarrier, travelCancellation } = dto;
		if (
			typeof instantAssignment !== 'boolean' ||
			typeof autodispatchCarrier !== 'boolean' ||
			typeof travelCancellation !== 'boolean'
		) {
			return null;
		}
		return { instantAssignment, autodispatchCarrier, travelCancellation };
	}
}

/** Bit 0/1 equivalente al booleano del parámetro — el formato en que la DB persiste el flag. */
export function flagBit(params: CarrierRouteFlagParameters, flag: RouteFlagName): number {
	return params[flag] ? 1 : 0;
}
