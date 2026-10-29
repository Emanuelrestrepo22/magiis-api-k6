// tests/specs/_flows/mx-5846-driver-candidate-preference.api.test.ts
// MX-5846 — Decision-table scaffold: passenger/requester driver-preference vs the
// immediate-trip driver-candidate search (findDriversCandidate).
//
// Data-driven over the 9-cell decision table (EC-01..EC-09). Each row seeds
// `passenger_driver_preference` on one/both axes (P = passenger, R = requester),
// triggers the immediate-trip driver-candidate search, asserts whether driver D is
// in/out of the candidate set + its `isFavourite` flag, then cleans up the seed.
//
// AXES (per MX-5846):
//   P = preference set on the PASSENGER  (the traveller)          → seed on passengerUserId
//   R = preference set on the REQUESTER   (who books the trip)     → seed on requesterUserId
//   preference_type: F = favourite · B = block · none = no row
//   Rule surfaced by the table: BLOCK on either axis outranks FAVOURITE ⇒ D excluded;
//   FAVOURITE on either axis ⇒ D included once (deduped) with isFavourite=true;
//   no preference ⇒ D is an ordinary candidate (isFavourite=false).
//
// DOUBLE GUARD (same as the mutation harness — seeding a preference IS a mutation):
//   - skipped unless ALLOW_MUTATIONS=1 (explicit opt-in + QA Lead green light);
//   - NEVER runs against PROD (ENV=prod) — hard rule, production is not mutated.
//   The cleanup in `finally` guarantees no residue.
//
// SEED PREREQS (real passenger/requester user ids — no plausible placeholder FK):
//   MAGIIS_SEED_PASSENGER_USER_ID  → P axis (passenger who travels)
//   MAGIIS_SEED_REQUESTER_USER_ID  → R axis (user who books; must differ from P for EC-08)
//   MAGIIS_SEED_CANDIDATE_DRIVER_ID → driver D under test (falls back to cfg.driverId)
//   Missing any required one → test.skip with reason.
//
// RESOLVED endpoints (openapi.yaml, PassengerUser tag):
//   POST   passengers/{passengerUserId}/driverPreference           body PassengerDriverPreferenceRequestDTO { driverId, preferenceType } → 200
//   GET    passengers/{passengerUserId}/driverPreference/carrier/{carrierId}  → DriverPreferenceInfoDTO[] (verify seed; has preferenceType)
//   DELETE passengers/{passengerUserId}/driverPreference/{driverId} → 200 (cleanup)
//
// UNRESOLVED from the repo (see MX5846_WIRED gate below):
//   1. Immediate-trip driver-candidate search `findDriversCandidate` — no such operationId
//      in openapi.yaml. `getCandidates` (/carriers/{carrierId}/travels/{travelId}/candidates)
//      needs a pre-existing travelId and its DriverCandidateResponseDTO has NO isFavourite field.
//      The exact immediate-trip query (origin/destination/requester/passenger params) lives in Jira MX-5846.
//   2. `preferenceType` wire values for F/B — openapi types it as free-form string (no enum).
//      Confirm the real values (e.g. 'FAVORITE'/'BLOCK') against the backend / MX-5846 before enabling.
// While unresolved, MX5846_WIRED=false and every row skips with a precise reason
// (no backend call is made with guessed data — no false greens).

import { test, expect } from '@TestBase';
import { expect2xx, makeAnnotate } from '@helpers';

// Trazabilidad canónica del portafolio (type:'tms' + 'tc') — consumida por el xray-reporter.
const annotate = makeAnnotate('MX-5846');

const ALLOW_MUTATIONS = process.env.ALLOW_MUTATIONS === '1';
const IS_PROD = (process.env.ENV ?? 'uat') === 'prod';
const SEED_PASSENGER_USER_ID = process.env.MAGIIS_SEED_PASSENGER_USER_ID;
const SEED_REQUESTER_USER_ID = process.env.MAGIIS_SEED_REQUESTER_USER_ID;
const SEED_CANDIDATE_DRIVER_ID = process.env.MAGIIS_SEED_CANDIDATE_DRIVER_ID;

// Master gate: flip to true only after the two TODO(MX-5846) items below are wired.
const MX5846_WIRED = false;

// TODO(MX-5846): confirm exact wire values for preferenceType (F=favourite, B=block).
// openapi.yaml types preferenceType as free-form string; operations getDriversBlocked +
// addFavoriteDrivers imply two kinds. These placeholders MUST be verified before enabling.
const PREF_WIRE: Record<'F' | 'B', string> = { F: 'FAVORITE', B: 'BLOCK' };

type PrefAxis = 'F' | 'B' | 'none';

interface DecisionRow {
	ec: string;
	/** P — preference on the passenger axis. */
	passenger: PrefAxis;
	/** R — preference on the requester axis. */
	requester: PrefAxis;
	/** Expected: is driver D present in the candidate set? */
	expectInCandidateSet: boolean;
	/** Expected isFavourite flag when D is present; null when D is absent (field N/A). */
	expectIsFavourite: boolean | null;
	rationale: string;
}

// 9-cell decision table (MX-5846). B (block) on either axis wins over F (favourite).
const DECISION_TABLE: DecisionRow[] = [
	{
		ec: 'EC-01',
		passenger: 'B',
		requester: 'none',
		expectInCandidateSet: false,
		expectIsFavourite: null,
		rationale: 'block on passenger axis excludes D'
	},
	{
		ec: 'EC-02',
		passenger: 'none',
		requester: 'B',
		expectInCandidateSet: false,
		expectIsFavourite: null,
		rationale: 'block on requester axis excludes D'
	},
	{
		ec: 'EC-03',
		passenger: 'F',
		requester: 'B',
		expectInCandidateSet: false,
		expectIsFavourite: null,
		rationale: 'block outranks favourite (block > favourite)'
	},
	{
		ec: 'EC-04',
		passenger: 'B',
		requester: 'F',
		expectInCandidateSet: false,
		expectIsFavourite: null,
		rationale: 'block outranks favourite (block > favourite)'
	},
	{
		ec: 'EC-05',
		passenger: 'B',
		requester: 'B',
		expectInCandidateSet: false,
		expectIsFavourite: null,
		rationale: 'block on both axes excludes D'
	},
	{
		ec: 'EC-06',
		passenger: 'F',
		requester: 'none',
		expectInCandidateSet: true,
		expectIsFavourite: true,
		rationale: 'favourite on passenger axis includes D'
	},
	{
		ec: 'EC-07',
		passenger: 'none',
		requester: 'F',
		expectInCandidateSet: true,
		expectIsFavourite: true,
		rationale: 'favourite on requester axis includes D'
	},
	{
		ec: 'EC-08',
		passenger: 'F',
		requester: 'F',
		expectInCandidateSet: true,
		expectIsFavourite: true,
		rationale: 'favourite on both axes (P≠R): D included once, no duplicate'
	},
	{
		ec: 'EC-09',
		passenger: 'none',
		requester: 'none',
		expectInCandidateSet: true,
		expectIsFavourite: false,
		rationale: 'no preference: D is an ordinary candidate'
	}
];

function axisLabel(a: PrefAxis): string {
	return a === 'none' ? 'none' : a;
}

test.describe.serial('[_flows] MX-5846 — driver-candidate preference decision table', () => {
	test.skip(IS_PROD, 'Mutaciones PROHIBIDAS contra PROD.');
	test.skip(!ALLOW_MUTATIONS, 'Mutación deshabilitada: setear ALLOW_MUTATIONS=1 + luz verde del QA Lead (solo UAT).');
	test.skip(
		!SEED_PASSENGER_USER_ID || !SEED_REQUESTER_USER_ID,
		'Faltan seeds de usuarios reales: setear MAGIIS_SEED_PASSENGER_USER_ID + MAGIIS_SEED_REQUESTER_USER_ID (P≠R para EC-08).'
	);

	for (const row of DECISION_TABLE) {
		const verdict = row.expectInCandidateSet
			? `D en candidatos (isFavourite=${String(row.expectIsFavourite)})`
			: 'D excluido de candidatos';
		const title = `${row.ec} P=${axisLabel(row.passenger)} R=${axisLabel(row.requester)} → ${verdict} [MX-5846]`;

		test(title, async ({ magiisApi, cfg }) => {
			annotate(row.ec); // type:'tms'=MX-5846 + type:'tc'=MX-5846-EC-0N
			const passengerUserId = Number(SEED_PASSENGER_USER_ID);
			const requesterUserId = Number(SEED_REQUESTER_USER_ID);
			const driverId = Number(SEED_CANDIDATE_DRIVER_ID ?? cfg.driverId);

			// Until the immediate-trip search + isFavourite assertion + preferenceType wire
			// values are confirmed, skip BEFORE any seed POST so no backend call runs with
			// guessed data. Flip MX5846_WIRED once the two TODO(MX-5846) items are wired.
			test.skip(
				!MX5846_WIRED,
				'TODO(MX-5846): wire the immediate-trip findDriversCandidate endpoint + isFavourite assertion and confirm preferenceType wire values — exact query/shape lives in Jira MX-5846.'
			);

			// Track which axes we seeded so cleanup only touches what we created.
			const seeded: Array<{ userId: number; driverId: number }> = [];

			try {
				// ── seed P (passenger axis) ─────────────────────────────────────────
				if (row.passenger !== 'none') {
					const res = await magiisApi.postJson(`passengers/${passengerUserId}/driverPreference`, {
						driverId,
						preferenceType: PREF_WIRE[row.passenger]
					});
					await expect2xx(res);
					seeded.push({ userId: passengerUserId, driverId });
				}

				// ── seed R (requester axis) ─────────────────────────────────────────
				if (row.requester !== 'none') {
					const res = await magiisApi.postJson(`passengers/${requesterUserId}/driverPreference`, {
						driverId,
						preferenceType: PREF_WIRE[row.requester]
					});
					await expect2xx(res);
					seeded.push({ userId: requesterUserId, driverId });
				}

				// ── verify the seed took (real read) ────────────────────────────────
				for (const s of seeded) {
					const check = await magiisApi.getJson(`passengers/${s.userId}/driverPreference/carrier/${cfg.carrierId}`);
					await expect2xx(check);
					const prefs = (await check.json()) as Array<{ driverId?: number; preferenceType?: string }>;
					expect(Array.isArray(prefs), 'driverPreference/carrier debe devolver un array').toBe(true);
					expect(
						prefs.some((p) => p.driverId === s.driverId),
						`el driver ${s.driverId} debe aparecer en las preferencias del usuario ${s.userId}`
					).toBe(true);
				}

				// ── trigger: immediate-trip driver-candidate search ─────────────────
				// TODO(MX-5846): wire endpoint. No `findDriversCandidate` operationId in
				// openapi.yaml, and getCandidates needs a travelId + its DTO lacks isFavourite.
				// Exact immediate-trip query (origin/destination/requester/passenger) is in Jira MX-5846.
				// const candidates = await findImmediateTripCandidates(magiisApi, { carrierId: cfg.carrierId, passengerUserId, requesterUserId });

				// ── assert: D in/out of candidate set + isFavourite ─────────────────
				// TODO(MX-5846): assert against the real response shape once wired, e.g.:
				//   const found = candidates.find((c) => c.driverUserId === driverId);
				//   if (row.expectInCandidateSet) {
				//     expect(found, row.rationale).toBeDefined();
				//     expect(found?.isFavourite).toBe(row.expectIsFavourite);
				//     expect(candidates.filter((c) => c.driverUserId === driverId)).toHaveLength(1); // EC-08 no-dup
				//   } else {
				//     expect(found, row.rationale).toBeUndefined();
				//   }
				expect(row.expectInCandidateSet, `${row.ec}: ${row.rationale}`).toBe(row.expectInCandidateSet);
			} finally {
				// ── cleanup (idempotent) — remove only the preferences we seeded ─────
				for (const s of seeded) {
					const del = await magiisApi.deleteJson(`passengers/${s.userId}/driverPreference/${s.driverId}`);
					expect([200, 204, 404], 'cleanup DELETE tolera 404 (ya eliminado)').toContain(del.status());
				}
			}
		});
	}
});
