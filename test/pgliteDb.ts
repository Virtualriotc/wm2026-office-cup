// ============================================================================
// PGlite test harness — a real Postgres (compiled to WASM) in-process, so the
// DrizzleStore runs on the SAME Drizzle query builder it uses against Neon in
// prod. Each call returns a FRESH, isolated database with the schema applied.
//
// "Programmatic apply": we run the generated migrations (db/migrations) into
// the PGlite instance via Drizzle's pglite migrator — the same SQL that ships
// to Neon, so the test schema can't drift from prod.
// ============================================================================

import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { DrizzleDb } from "../db/drizzleStore";

const MIGRATIONS_FOLDER = resolve(__dirname, "../db/migrations");

/** Spin up a fresh in-memory PGlite DB with the full schema migrated in. */
export async function makePgliteDb(): Promise<DrizzleDb> {
  const client = new PGlite(); // in-memory; no dataDir => ephemeral
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as DrizzleDb;
}
