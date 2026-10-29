// tests/specs/controllers/travels-create-route-flags-explicit.api.test.ts
// MG-682 (stock TM-1361, phase 3.2) — TC32/TC33/TC34 of the MG-682 route-flags suite.
// Component: TravelsApi. Complements travels-create-route-flags.api.test.ts (TM-945), which only
// covers fastestRoute; these three cover ALL three flags on real create and update.
//
// PLAN (scenario <-> Xray key <-> oracle)
//   TM-1158 (TC32) POST /travels, avoidTolls/avoidHighways/fastestRoute all OMITTED
//                  -> TRAVEL.AVOIDTOLLS / AVOIDHIGHWAYS / FASTEST_ROUTE equal the carrier PARAMETERS
//                     (read live with carrierParameters.readRouteFlagParameters, never hardcoded);
//                     precondition: at least one parameter is true (backend default is false).
//   TM-1159 (TC33) POST /travels, all three flags EXPLICIT with the OPPOSITE value of the carrier
//                  parameter -> TRAVEL columns persist the explicit values (not flattened to PARAMETERS).
//   TM-1160 (TC34) Seed a trip with fastestRoute=false (carrier PARAMETERS.FASTEST_ROUTE=true), then
//                  PUT /travels/{id}/update OMITTING fastestRoute -> TRAVEL.FASTEST_ROUTE re-resolves
//                  to the carrier parameter (1), independent of the seed.
//   Oracle: Oracle TEST DB (TRAVEL; runs target ENV=test, not UAT). Create/update responses do not expose the flags, so there is no
//   API oracle; without `db` the case skips with an explicit reason (never a false PASSED).
//   Precondition (per Xray definition): carrier 1521 in TEST with PARAMETERS.FASTEST_ROUTE=true. TC34
//   asserts it explicitly so a misconfigured carrier fails loudly instead of passing vacuously.
//   Business rule: the trip GMT is the pickup address timezone; the BA route is used as in TM-945.
//   Known defect MG-682 (#35827, frequent destination with null flags -> false) is out of scope here.
//
// Credit: each test declares annotation `tms_only` so the reporter credits ONLY its own key (the shared
// createTravelWithRouteFlag/updateTravelWithRouteFlag ATCs push runtime @atc('TM-945'), which must not
// credit TM-945 with these different scenarios).
//
// Cleanup: every trip created is cancelled in afterEach with the real DTO body (travels.cancelTravel)
// and annotated as `travel-created`.

import { test, expect } from '@TestBase';
import { mg682Data } from '@data/mg682';
import { flagBit } from '@components/api/CarrierParametersApi';

interface TravelCleanupState {
	carrierId: number;
	travelId: number;
}

interface FlagRow {
	FASTEST_ROUTE: number | null;
	AVOIDTOLLS: number | null;
	AVOIDHIGHWAYS: number | null;
}

const FLAGS_SQL = 'SELECT FASTEST_ROUTE, AVOIDTOLLS, AVOIDHIGHWAYS FROM TRAVEL WHERE ID = :id';

/** Registers the afterEach that cancels the trip created by the test (runs even if the test fails). */
function registerTravelCleanup(): (state: TravelCleanupState) => void {
	let state: TravelCleanupState | null = null;
	test.afterEach(async ({ travels }) => {
		if (!state) return;
		await travels.cancelTravel(state.carrierId, state.travelId);
		state = null;
	});
	return (next) => {
		state = next;
	};
}

test.describe('TravelController — MG-682: route flags on create/update with omitted vs explicit values', () => {
	const setCleanup = registerTravelCleanup();

	test(
		'TM-1158: should inherit the three route flags from the carrier parameters when POST /travels omits them',
		{ annotation: { type: 'tms_only', description: 'TM-1158' } },
		async ({ travels, carrierParameters, db }) => {
			const { carrierId, route } = mg682Data();
			const params = await carrierParameters.readRouteFlagParameters(carrierId);
			test.skip(
				!params,
				`Could not read PARAMETERS of carrier ${carrierId} (Discover failed) — no oracle for expected.`
			);
			// The backend default for an omitted, unresolved flag is false: if every carrier parameter is false,
			// "resolved against the parameter" and "default value" are indistinguishable (vacuous oracle).
			expect(
				params!.fastestRoute || params!.avoidTolls || params!.avoidHighways,
				`precondition: carrier ${carrierId} must have at least one route-flag PARAMETER true (differs from the backend default false), otherwise the oracle is vacuous`
			).toBe(true);
			const requesterUserId = await travels.findRequesterUserId(carrierId);
			test.skip(
				requesterUserId == null,
				`Carrier ${carrierId} has no linked passenger (clients empty) — no real requesterUserId.`
			);

			const res = await travels.createTravelWithRouteFlag(carrierId, {
				origin: route.origin,
				destination: route.destination,
				requesterUserId: requesterUserId!
				// avoidTolls / avoidHighways / fastestRoute omitted on purpose — variant under test.
			});
			const { travelId } = (await res.json()) as { travelId?: number };
			expect(travelId, 'create must return the travelId').toBeDefined();
			setCleanup({ carrierId, travelId: travelId! });
			test
				.info()
				.annotations.push({ type: 'travel-created', description: `carrier ${carrierId} · travelId ${travelId}` });

			test.skip(
				!db,
				'No Oracle credentials (ORACLE_* in .env.<env>): TRAVEL flags not verifiable — response does not expose them.'
			);
			const rows = await db!.query<FlagRow>(FLAGS_SQL, { id: travelId! });
			expect(rows).toHaveLength(1);
			expect(rows[0].FASTEST_ROUTE, `FASTEST_ROUTE must come from carrier ${carrierId} parameter`).toBe(
				flagBit(params!, 'fastestRoute')
			);
			expect(rows[0].AVOIDTOLLS, `AVOIDTOLLS must come from carrier ${carrierId} parameter`).toBe(
				flagBit(params!, 'avoidTolls')
			);
			expect(rows[0].AVOIDHIGHWAYS, `AVOIDHIGHWAYS must come from carrier ${carrierId} parameter`).toBe(
				flagBit(params!, 'avoidHighways')
			);
		}
	);

	test(
		'TM-1159: should persist each explicit route flag regardless of the carrier parameter when POST /travels sends them',
		{ annotation: { type: 'tms_only', description: 'TM-1159' } },
		async ({ travels, carrierParameters, db }) => {
			const { carrierId, route } = mg682Data();
			const params = await carrierParameters.readRouteFlagParameters(carrierId);
			test.skip(
				!params,
				`Could not read PARAMETERS of carrier ${carrierId} (Discover failed) — no oracle for expected.`
			);
			const requesterUserId = await travels.findRequesterUserId(carrierId);
			test.skip(
				requesterUserId == null,
				`Carrier ${carrierId} has no linked passenger (clients empty) — no real requesterUserId.`
			);

			// Every flag is sent with the OPPOSITE of the carrier parameter, so flattening is detectable.
			const explicit = {
				fastestRoute: !params!.fastestRoute,
				avoidTolls: !params!.avoidTolls,
				avoidHighways: !params!.avoidHighways
			};
			const res = await travels.createTravelWithRouteFlag(carrierId, {
				origin: route.origin,
				destination: route.destination,
				requesterUserId: requesterUserId!,
				...explicit
			});
			const { travelId } = (await res.json()) as { travelId?: number };
			expect(travelId, 'create must return the travelId').toBeDefined();
			setCleanup({ carrierId, travelId: travelId! });
			test
				.info()
				.annotations.push({ type: 'travel-created', description: `carrier ${carrierId} · travelId ${travelId}` });

			test.skip(
				!db,
				'No Oracle credentials (ORACLE_* in .env.<env>): TRAVEL flags not verifiable — response does not expose them.'
			);
			const rows = await db!.query<FlagRow>(FLAGS_SQL, { id: travelId! });
			expect(rows).toHaveLength(1);
			expect(rows[0].FASTEST_ROUTE, `explicit fastestRoute=${explicit.fastestRoute} must not be flattened`).toBe(
				explicit.fastestRoute ? 1 : 0
			);
			expect(rows[0].AVOIDTOLLS, `explicit avoidTolls=${explicit.avoidTolls} must not be flattened`).toBe(
				explicit.avoidTolls ? 1 : 0
			);
			expect(rows[0].AVOIDHIGHWAYS, `explicit avoidHighways=${explicit.avoidHighways} must not be flattened`).toBe(
				explicit.avoidHighways ? 1 : 0
			);
		}
	);

	test(
		'TM-1160: should resolve the omitted fastestRoute against the carrier parameter when PUT /travels/{travelId}/update edits a trip seeded with it false',
		{ annotation: { type: 'tms_only', description: 'TM-1160' } },
		async ({ travels, carrierParameters, db }) => {
			const { carrierId, route } = mg682Data();
			const params = await carrierParameters.readRouteFlagParameters(carrierId);
			test.skip(
				!params,
				`Could not read PARAMETERS of carrier ${carrierId} (Discover failed) — no oracle for expected.`
			);
			expect(
				params!.fastestRoute,
				`precondition: carrier ${carrierId} must have PARAMETERS.FASTEST_ROUTE=true so a false seed differs from the resolved value`
			).toBe(true);
			const requesterUserId = await travels.findRequesterUserId(carrierId);
			test.skip(
				requesterUserId == null,
				`Carrier ${carrierId} has no linked passenger (clients empty) — no real requesterUserId.`
			);

			const createRes = await travels.createTravelWithRouteFlag(carrierId, {
				origin: route.origin,
				destination: route.destination,
				requesterUserId: requesterUserId!,
				fastestRoute: false
			});
			const { travelId } = (await createRes.json()) as { travelId?: number };
			expect(travelId, 'seed create must return the travelId').toBeDefined();
			setCleanup({ carrierId, travelId: travelId! });
			test.info().annotations.push({
				type: 'travel-created',
				description: `carrier ${carrierId} · travelId ${travelId} (seed fastestRoute=false, before update)`
			});

			await travels.updateTravelWithRouteFlag(carrierId, {
				travelId: travelId!,
				origin: route.origin,
				destination: route.destination
				// fastestRoute omitted on purpose — variant under test.
			});

			test.skip(
				!db,
				'No Oracle credentials (ORACLE_* in .env.<env>): TRAVEL flags not verifiable — response does not expose them.'
			);
			const rows = await db!.query<FlagRow>(FLAGS_SQL, { id: travelId! });
			expect(rows).toHaveLength(1);
			expect(
				rows[0].FASTEST_ROUTE,
				`FASTEST_ROUTE must re-resolve against carrier ${carrierId} parameter on update, not keep the false seed`
			).toBe(flagBit(params!, 'fastestRoute'));
			expect(rows[0].AVOIDTOLLS, 'AVOIDTOLLS must never be NULL').not.toBeNull();
			expect(rows[0].AVOIDHIGHWAYS, 'AVOIDHIGHWAYS must never be NULL').not.toBeNull();
		}
	);
});
