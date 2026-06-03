// ============================================================================
// Store contract — runs the SAME suite against BOTH implementations:
//   - MockStore (in-memory), and
//   - DrizzleStore on a real Postgres (PGlite/WASM) with the generated
//     migrations applied.
// Identical assertions => proof the Drizzle store matches the mock byte-for-byte.
//
// Both run on a FIXED clock so the shared seed fixtures partition the same way.
// ============================================================================

import { MockStore } from "./data";
import { DrizzleStore } from "../db/drizzleStore";
import { makePgliteDb } from "../test/pgliteDb";
import {
  runStoreContract,
  type ContractStore,
} from "../test/storeContract";

// A point in time that splits the REAL openfootball 2026 schedule: the group
// stage + early knockouts (Jun 11 – late Jun) are past => locked; the late
// knockouts (semis Jul 14–15, final Jul 19) are future => open. 78 of the 104
// fixtures are past at this instant, 26 are future.
const FIXED_NOW = new Date("2026-07-01T00:00:00.000Z");

// Known REAL fixtures relative to FIXED_NOW (ids are content-derived in
// lib/seed.ts from the bundled data/worldcup-2026.json).
const LOCKED_MATCH_ID = "of-matchday-1-mexico-south-africa"; // 2026-06-11 — past
const OPEN_MATCH_ID = "of-final-w101-w102"; // 2026-07-19 — future (final, 6 pts)
const SECOND_OPEN_MATCH_ID = "of-semi-final-w97-w98"; // 2026-07-14 — future
// A future SF that stays a bracket PLACEHOLDER (never resolved in this suite),
// so picks on it must be rejected by the semantic gate.
const UNRESOLVED_KO_MATCH_ID = "of-semi-final-w99-w100"; // 2026-07-15 — future, placeholder

// -- Fixed-clock subclasses (the only override needed for determinism) --------

class FixedClockMockStore extends MockStore {
  protected override now(): Date {
    return FIXED_NOW;
  }
}

class FixedClockDrizzleStore extends DrizzleStore {
  protected override now(): Date {
    return FIXED_NOW;
  }
}

// -- Factories ----------------------------------------------------------------

async function makeMock(): Promise<ContractStore> {
  // seedDemo: false => a clean store (departments + fixtures only), matching a
  // fresh DrizzleStore exactly.
  const store = new FixedClockMockStore({ seedDemo: false });
  await store.seedFromOpenfootball();
  return {
    store,
    lockedMatchId: LOCKED_MATCH_ID,
    openMatchId: OPEN_MATCH_ID,
    secondOpenMatchId: SECOND_OPEN_MATCH_ID,
    unresolvedKoMatchId: UNRESOLVED_KO_MATCH_ID,
  };
}

async function makeDrizzle(): Promise<ContractStore> {
  const db = await makePgliteDb();
  const store = new FixedClockDrizzleStore(db);
  await store.seedFromOpenfootball();
  return {
    store,
    lockedMatchId: LOCKED_MATCH_ID,
    openMatchId: OPEN_MATCH_ID,
    secondOpenMatchId: SECOND_OPEN_MATCH_ID,
    unresolvedKoMatchId: UNRESOLVED_KO_MATCH_ID,
  };
}

runStoreContract("MockStore", makeMock);
runStoreContract("DrizzleStore (PGlite)", makeDrizzle);
