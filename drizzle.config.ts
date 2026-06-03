import type { Config } from "drizzle-kit";

// Drizzle Kit config — only relevant when DATABASE_URL is set (Neon Postgres).
// Generates migrations from db/schema.ts. The app itself runs on the in-memory
// mock store when DATABASE_URL is unset, so this is not needed for local dev.
export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
