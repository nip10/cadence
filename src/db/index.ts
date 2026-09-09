import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

/*
 * One connection in serverless, more locally. Supabase sits behind a pooler,
 * and `prepare: false` is what that pooler needs.
 */
const client = postgres(url, {
  max: process.env.NODE_ENV === "production" ? 1 : 10,
  prepare: false,
});

export const db = drizzle(client, { schema });
export { schema };
