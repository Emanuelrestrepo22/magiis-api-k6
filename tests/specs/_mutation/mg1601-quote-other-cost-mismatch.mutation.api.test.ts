// tests/specs/_mutation/mg1601-quote-other-cost-mismatch.mutation.api.test.ts
// MG-1601-AC5 — contrato de API del ATP TM-1285, label `contrato-api` (decisión QA lead 19/10/2026): ninguna
// pantalla emite createQuote / updateQuote y la «Cotización» de Carrier V1 no envía otherCosts, así que el
// rechazo solo se ejerce por API.
//
// Runs target ENV=test (carrier 1521): el pasajero individual «Marcela Usa Tres» con el tarifador Base por
// venta y el concepto por costo del catálogo «QA F2 ...» solo existen en TEST; decisión QA lead 19/10.
//
// PLAN (escenario <-> key Xray <-> oráculo)
//   TM-1440  un ítem de otros costos POR COSTO (tipo opuesto al tarifador por venta del pasajero) enviado por
//            los tres caminos de cotización:
//              quotes/quoteWeb, quotes/quote (createQuote) y quotes/quote/{id} (updateQuote)
//            -> 409 OTHER_COST_RATE_TYPE_MISMATCH y rechazo ATÓMICO: QUOTES del carrier sin filas nuevas y, en
//            updateQuote, la cotización existente intacta (STATUS, PRICE, OTHER_COST_TOTAL y sin filas en
//            QUOTE_OTHER_COSTS). El concepto por costo se lee en vivo de CARRIER_OTHER_COSTS (nunca se
//            hardcodea el id). Los caminos de viaje los cubre TM-1421 (otro Test).
//
// GUARDAS: doble (ALLOW_MUTATIONS=1 y nunca prod) porque el setup de updateQuote crea 1 cotización.
// CLEANUP: la cotización de setup se cancela en afterEach (PUT quotes/quote/{id}/cancel), aun si el test falla.
//
// Crédito: `tms_only` en cada test.

import { test, expect } from '@TestBase';
import {
	F2_NOTES,
	F2_QUOTE_PASSENGER,
	F2_TEST_ONLY_REASON,
	buildCreateQuoteBody,
	buildQuoteWebBody,
	isF2Env
} from '@data/f2';
import { observe, responseBody } from '@data/f2/observe';
import { markCallDone, pace } from '@data/f2/pace';

const BY_COST_ITEM_SQL = `SELECT MIN(ID) AS ID FROM CARRIER_OTHER_COSTS WHERE CARRIERACCOUNT_ID = :carrierId AND DELETED = 0 AND IS_BY_COST = 1`;
const QUOTES_COUNT_SQL = `SELECT COUNT(*) AS N FROM QUOTES WHERE CARRIER_ACCOUNT_ID = :carrierId`;
const QUOTE_ROW_SQL = `SELECT STATUS, PRICE, OTHER_COST_TOTAL FROM QUOTES WHERE ID = :id`;
const QUOTE_ITEMS_SQL = `SELECT COUNT(*) AS N FROM QUOTE_OTHER_COSTS WHERE QUOTE_ID = :id`;

interface QuoteRow {
	STATUS: number;
	PRICE: number;
	OTHER_COST_TOTAL: number;
}

test.describe('MG-1601-AC5: cotización con ítem de otros costos del tipo equivocado (contrato-api)', () => {
	let quoteToCancel: number | null = null;

	test.beforeEach(({ cfg }) => {
		test.skip(!isF2Env(), F2_TEST_ONLY_REASON);
		test.skip(
			process.env.ALLOW_MUTATIONS !== '1' || cfg.env === 'prod',
			'Mutación: exige ALLOW_MUTATIONS=1 y nunca prod.'
		);
	});

	test.afterEach(async ({ quote }) => {
		if (quoteToCancel === null) return;
		const id = quoteToCancel;
		quoteToCancel = null;
		await pace();
		await quote.cancelQuote(id);
	});

	test(
		'TM-1440: should reject quoteWeb with 409 OTHER_COST_RATE_TYPE_MISMATCH and persist no quote',
		{ annotation: { type: 'tms_only', description: 'TM-1440' } },
		async ({ quote, db, cfg }) => {
			test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): ítem por costo y conteo de QUOTES no verificables.');
			const carrierId = cfg.carrierId;
			const itemId = (await db!.query<{ ID: number | null }>(BY_COST_ITEM_SQL, { carrierId }))[0].ID;
			test.skip(itemId == null, 'No hay concepto por costo activo en el catálogo del carrier.');
			const passengerId = await quote.findPassengerUserId(carrierId, F2_QUOTE_PASSENGER);
			test.skip(passengerId == null, 'No se encontró a la pasajera individual «Marcela Usa Tres».');

			const before = (await db!.query<{ N: number }>(QUOTES_COUNT_SQL, { carrierId }))[0].N;
			const body = buildQuoteWebBody(passengerId!, {
				otherCosts: [{ id: itemId, quantity: 1, price: 10, comments: '' }]
			});
			await pace();
			const res = await quote.createQuoteWebRejectsOtherCostMismatch(body);
			await observe('TM-1440-quoteWeb-409', {
				endpoint: 'POST quotes/quoteWeb',
				variation: { otherCosts: [{ id: itemId, quantity: 1, price: 10 }] },
				sentBody: body,
				status: res.status(),
				response: await responseBody(res)
			});
			const after = (await db!.query<{ N: number }>(QUOTES_COUNT_SQL, { carrierId }))[0].N;
			expect(after, 'QUOTES del carrier no debe cambiar tras el 409').toBe(before);
		}
	);

	test(
		'TM-1440: should reject createQuote with 409 OTHER_COST_RATE_TYPE_MISMATCH and persist no quote',
		{ annotation: { type: 'tms_only', description: 'TM-1440' } },
		async ({ quote, db, cfg }) => {
			test.skip(!db, 'Sin credenciales Oracle (ORACLE_*_TEST): ítem por costo y conteo de QUOTES no verificables.');
			const carrierId = cfg.carrierId;
			const itemId = (await db!.query<{ ID: number | null }>(BY_COST_ITEM_SQL, { carrierId }))[0].ID;
			test.skip(itemId == null, 'No hay concepto por costo activo en el catálogo del carrier.');

			const before = (await db!.query<{ N: number }>(QUOTES_COUNT_SQL, { carrierId }))[0].N;
			const body = buildCreateQuoteBody({ otherCosts: [{ id: itemId, quantity: 1, price: 10, comments: '' }] });
			await pace();
			const res = await quote.createQuoteRejectsOtherCostMismatch(body);
			await observe('TM-1440-createQuote-409', {
				endpoint: 'POST quotes/quote',
				variation: { otherCosts: [{ id: itemId, quantity: 1, price: 10 }] },
				sentBody: body,
				status: res.status(),
				response: await responseBody(res)
			});
			const after = (await db!.query<{ N: number }>(QUOTES_COUNT_SQL, { carrierId }))[0].N;
			expect(after, 'QUOTES del carrier no debe cambiar tras el 409').toBe(before);
		}
	);

	test(
		'TM-1440: should reject updateQuote with 409 OTHER_COST_RATE_TYPE_MISMATCH and leave the existing quote untouched',
		{ annotation: { type: 'tms_only', description: 'TM-1440' } },
		async ({ quote, db, cfg }) => {
			test.skip(
				!db,
				'Sin credenciales Oracle (ORACLE_*_TEST): ítem por costo y estado de la cotización no verificables.'
			);
			const carrierId = cfg.carrierId;
			const itemId = (await db!.query<{ ID: number | null }>(BY_COST_ITEM_SQL, { carrierId }))[0].ID;
			test.skip(itemId == null, 'No hay concepto por costo activo en el catálogo del carrier.');

			// Setup: una cotización válida (otherCosts vacío) que se cancela en afterEach.
			await pace();
			const quoteId = await quote.createCleanQuote(
				buildCreateQuoteBody({ note: `${F2_NOTES.quote} updateQuote base` })
			);
			quoteToCancel = quoteId;
			markCallDone();
			test.info().annotations.push({ type: 'quote-created', description: `carrier ${carrierId} · quoteId ${quoteId}` });
			const rowBefore = (await db!.query<QuoteRow>(QUOTE_ROW_SQL, { id: quoteId }))[0];
			expect(rowBefore.STATUS, 'precondición: la cotización de setup está en estado QUOTE (0)').toBe(0);
			const countBefore = (await db!.query<{ N: number }>(QUOTES_COUNT_SQL, { carrierId }))[0].N;

			const body = buildCreateQuoteBody({
				note: `${F2_NOTES.quote} updateQuote base`,
				otherCosts: [{ id: itemId, quantity: 1, price: 10, comments: '' }]
			});
			await pace();
			const res = await quote.updateQuoteRejectsOtherCostMismatch(quoteId, body);
			await observe('TM-1440-updateQuote-409', {
				endpoint: `POST quotes/quote/${quoteId}`,
				variation: { otherCosts: [{ id: itemId, quantity: 1, price: 10 }] },
				sentBody: body,
				status: res.status(),
				response: await responseBody(res)
			});

			const rowAfter = (await db!.query<QuoteRow>(QUOTE_ROW_SQL, { id: quoteId }))[0];
			expect(rowAfter, 'la cotización existente debe quedar intacta (STATUS, PRICE, OTHER_COST_TOTAL)').toEqual(
				rowBefore
			);
			const items = (await db!.query<{ N: number }>(QUOTE_ITEMS_SQL, { id: quoteId }))[0].N;
			expect(items, 'no debe persistirse ningún ítem en QUOTE_OTHER_COSTS').toBe(0);
			const countAfter = (await db!.query<{ N: number }>(QUOTES_COUNT_SQL, { carrierId }))[0].N;
			expect(countAfter, 'updateQuote no debe crear cotizaciones nuevas').toBe(countBefore);
		}
	);
});
