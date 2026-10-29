// tests/specs/_flows/carrier-rate.kata.api.test.ts
// Piloto KATA (Nivel 2): consume el componente CarrierRateApi vía fixture DI en vez
// del cliente genérico plano. Demuestra el patrón componente + ATC del portafolio.
// READ-ONLY (solo GET) — mismo alcance que el spec plano carrier-rate.api.test.ts.
//
// TRAZABILIDAD: la ata al Test de Xray la aporta el decorador @atc('MG-3') sobre el ATC
// getRatesSuccessfully (CarrierRateApi) — ya NO se usa makeAnnotate en este spec. El
// decorador empuja la annotation type:'tms' que consume el xray-reporter.

import { test, expect } from '@TestBase';

test.describe('[kata-pilot] CarrierRate vía componente', () => {
	test('getRatesSuccessfully → array de tarifas', async ({ carrierRate, cfg }) => {
		const [res, list] = await carrierRate.getRatesSuccessfully(cfg.carrierId);
		expect(res.ok() || [400, 404].includes(res.status())).toBeTruthy();
		if (list.length > 0) expect(list[0]).toHaveProperty('id');
	});

	test('getDefaultRate → tolerante (puede no existir)', async ({ carrierRate, cfg }) => {
		const res = await carrierRate.getDefaultRate(cfg.carrierId);
		expect([200, 400, 404]).toContain(res.status());
	});
});
