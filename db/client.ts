import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

// ============================================================================
// Neon + Drizzle client. Only constructed when DATABASE_URL is set; the mock
// store path never imports this. Exposes a lazily-initialized singleton so we
// don't open a connection at import time during the mock-only flow.
// ============================================================================

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "getDb() called without DATABASE_URL. The app should use the mock store " +
        "(lib/data.ts getStore) when DATABASE_URL is unset.",
    );
  }
  const sql = neon(url);
  db = drizzle(sql, { schema });
  return db;
}

export { schema };
