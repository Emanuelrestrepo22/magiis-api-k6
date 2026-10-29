// tests/data/f2/simulation.ts
// Utilidades de oráculo para las respuestas de simulate / simulateAll de la campaña F2 (PK-A): emparejar por tipo de
// vehículo, comparar contra el baseline vivo (`baseline.ts`) y contra una respuesta de control, y compactar la
// respuesta para la evidencia (sin `routeMap`, que pesa cientos de KB y no aporta al contrato).

import { expect } from '@playwright/test';
import type { SimulationBreakdown } from '@api/TravelsApi';
import { describeDrift } from '@data/f2/baseline';
import type { BaselineConsensus } from '@data/f2/baseline';

/** Elemento de `simulateAll` del tipo de vehículo pedido (`transportTypeId` = `vehicleTypeId` del request). */
export function pickByVehicle(list: SimulationBreakdown[], vehicleTypeId: number): SimulationBreakdown | undefined {
	return list.find((s) => s.transportTypeId === vehicleTypeId);
}

/**
 * Aserciones de contrato de una cotización con UNA moneda (tarifador por venta o por costo): moneda del carrier,
 * tarifador y modo por costo del baseline, e importes = baseline. Un importe distinto se informa como posible
 * deriva de datos (R-2 del plan), no como defecto.
 */
export function assertAgainstBaseline(
	label: string,
	got: SimulationBreakdown,
	base: BaselineConsensus,
	currencyCode: string
): void {
	const drift = describeDrift(base, got.pricePointToPoint ?? Number.NaN, got.pricePointToPointCost ?? Number.NaN);
	expect(got.currency?.currencyId, `${label}: currency.currencyId (moneda del carrier)`).toBe(base.currencyId);
	expect(got.currency?.code, `${label}: currency.code`).toBe(currencyCode);
	expect(got.carrierRateByCost, `${label}: carrierRateByCost`).toBe(base.byCost);
	expect(got.rateId, `${label}: rateId (tarifador del baseline)`).toBe(base.carrierRateId);
	expect(got.pricePointToPoint, `${label}: pricePointToPoint — ${drift}`).toBe(base.sale);
	expect(got.pricePointToPointCost, `${label}: pricePointToPointCost — ${drift}`).toBe(base.cost);
}

/** Campos del desglose que deben coincidir entre una variante de `currencyId` y su control sin el campo. */
const COMPARED_FIELDS = [
	'rateId',
	'carrierRateByCost',
	'currency',
	'pricePointToPoint',
	'pricePointToPointCost',
	'totalCostPrice',
	'fixConceptsCost',
	'taxesCost'
] as const;

/** La variante responde lo mismo que el control (request sin el campo), campo a campo. */
export function assertSameBreakdown(label: string, got: SimulationBreakdown, control: SimulationBreakdown): void {
	for (const field of COMPARED_FIELDS) {
		expect(got[field], `${label}: ${field} igual al control sin currencyId`).toEqual(control[field]);
	}
}

/** Copia de la respuesta sin `routeMap` (para adjuntarla como evidencia). */
export function forEvidence(response: unknown): unknown {
	if (Array.isArray(response)) return response.map(forEvidence);
	if (response && typeof response === 'object') {
		const copy = { ...(response as Record<string, unknown>) };
		delete copy.routeMap;
		return copy;
	}
	return response;
}
