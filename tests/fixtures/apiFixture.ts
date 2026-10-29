// tests/fixtures/apiFixture.ts
// Fixture base de la suite api-e2e. Provee `magiisApi` (cliente) y `cfg` (runtime).
// KATA Nivel 2 (piloto): expone además `carrierRate` (componente de dominio, DI).

import { test as base, expect } from '@playwright/test';
import { MagiisApiClient } from '@clients/magiis-api-client';
import { getRuntimeConfig, type RuntimeConfig } from '@config/runtime';
import { CarrierRateApi } from '@components/api/CarrierRateApi';
import { PaymentApi } from '@components/api/PaymentApi';
import { PlacesApi } from '@components/api/PlacesApi';
import { FrequentDestinationApi } from '@components/api/FrequentDestinationApi';
import { TravelsApi } from '@components/api/TravelsApi';
import { AffiOsApi } from '@components/api/AffiOsApi';
import { CarrierParametersApi } from '@components/api/CarrierParametersApi';
import { CarrierOtherCostApi } from '@components/api/CarrierOtherCostApi';
import { QuoteApi } from '@components/api/QuoteApi';
import { ContractorAccountApi } from '@components/api/ContractorAccountApi';
import { OracleDb, oracleConfigFromEnv } from '@db/OracleDb';

type Fixtures = {
	magiisApi: MagiisApiClient;
	cfg: RuntimeConfig;
	carrierRate: CarrierRateApi;
	paymentApi: PaymentApi;
	placesApi: PlacesApi;
	frequentDestination: FrequentDestinationApi;
	/** KATA: componente del dominio Travels (tiempos/distancia) — MG-682 / TM-934. */
	travels: TravelsApi;
	/** KATA: componente del dominio AffiOS (acuerdos one-shot entre afiliados) — MG-682 / TM-969. */
	affiOs: AffiOsApi;
	/**
	 * KATA: componente del dominio Parámetros del carrier — MG-682. Solo Discover (sin ATCs):
	 * provee el ESPERADO de los casos leyendo `PARAMETERS` en vivo, para que ningún spec hardcodee
	 * el valor del entorno.
	 */
	carrierParameters: CarrierParametersApi;
	/** KATA: catálogo de otros costos del carrier — contrato apply sin rateByCost (TM-1414). */
	carrierOtherCost: CarrierOtherCostApi;
	/** KATA: cotizaciones — rechazo 409 por ítem del tipo equivocado (TM-1440). */
	quote: QuoteApi;
	/** KATA: cliente (ContractorAccount) — preparación del límite de cuenta corriente (TM-1394). Sin ATCs. */
	contractorAccount: ContractorAccountApi;
	/**
	 * Pata DB de la trifuerza — `null` cuando faltan las credenciales `ORACLE_*`,
	 * para que el caso SKIPEE en vez de fallar por configuración ausente:
	 *
	 *   test.skip(!db, 'Sin credenciales Oracle: la pata DB no es verificable');
	 *
	 * Es READ-ONLY por contrato (`OracleDb` rechaza todo lo que no sea SELECT).
	 * OJO: esto NO es el MCP de base de datos. El MCP es una herramienta del
	 * AGENTE; un spec corre en un proceso Node sin cliente MCP, así que la
	 * aserción de DB dentro del test exige este driver en proceso.
	 */
	db: OracleDb | null;
};

export const test = base.extend<Fixtures>({
	cfg: async ({}, use) => {
		await use(getRuntimeConfig());
	},
	magiisApi: async ({ request }, use) => {
		const client = new MagiisApiClient(request);
		await use(client);
	},
	// KATA piloto: componente de dominio inyectado con el cliente.
	carrierRate: async ({ magiisApi }, use) => {
		await use(new CarrierRateApi(magiisApi));
	},
	// KATA: componente del dominio Pagos (hold & cobro MG-512 + MP API).
	paymentApi: async ({ magiisApi }, use) => {
		await use(new PaymentApi(magiisApi));
	},
	// KATA: componente del dominio Places (autocompletado de direcciones — MG-117 / TM-65x).
	placesApi: async ({ magiisApi }, use) => {
		await use(new PlacesApi(magiisApi));
	},
	// KATA: componente del dominio Destino Frecuente (flags de ruta nunca NULL — MG-682 / TM-930).
	frequentDestination: async ({ magiisApi }, use) => {
		await use(new FrequentDestinationApi(magiisApi));
	},
	// KATA: componente del dominio Travels (tiempos/distancia — MG-682 / TM-934).
	travels: async ({ magiisApi }, use) => {
		await use(new TravelsApi(magiisApi));
	},
	// KATA: componente del dominio AffiOS (acuerdos one-shot entre afiliados — MG-682 / TM-969).
	affiOs: async ({ magiisApi }, use) => {
		await use(new AffiOsApi(magiisApi));
	},
	// KATA: componente del dominio Parámetros del carrier (oráculo vivo de MG-682).
	carrierParameters: async ({ magiisApi }, use) => {
		await use(new CarrierParametersApi(magiisApi));
	},
	// KATA: componente del dominio Otros costos del carrier (contrato apply).
	carrierOtherCost: async ({ magiisApi }, use) => {
		await use(new CarrierOtherCostApi(magiisApi));
	},
	// KATA: componente del dominio Cotizaciones.
	quote: async ({ magiisApi }, use) => {
		await use(new QuoteApi(magiisApi));
	},
	// KATA: componente del dominio Cliente (límite de cuenta corriente — TM-1394).
	contractorAccount: async ({ magiisApi }, use) => {
		await use(new ContractorAccountApi(magiisApi));
	},
	// Pata DB read-only. El driver se carga perezoso (modo THIN, sin Instant
	// Client), así que un entorno sin `ORACLE_*` colecciona igual y skipea.
	db: async ({}, use) => {
		const cfg = oracleConfigFromEnv();
		await use(cfg ? new OracleDb(cfg) : null);
	}
});

export { expect };
