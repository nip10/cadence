import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

function connect(): Database {
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

  return drizzle(client, { schema });
}

/**
 * Connected on first use, not on import.
 *
 * Next evaluates every module while collecting page data, so a client built at
 * import time turns a missing `DATABASE_URL` into a *build* failure — on Vercel
 * that means a deploy that cannot even start, with an error a long way from the
 * cause. Deferring it means a missing variable fails the request that needed
 * the database, and says so.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    cached ??= connect();
    return cached[property as keyof Database];
  },
});

export { schema };
