import { type SQL } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globals = globalThis as unknown as {
  campusPool?: Pool;
  campusDb?: NodePgDatabase<typeof schema>;
};
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL is not set. Follow the setup steps in README.md.",
    );
  if (!globals.campusPool) {
    globals.campusPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.VERCEL ? 3 : 15,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
    globals.campusPool.on("error", (error) =>
      console.error("An idle database connection closed", error.message),
    );
  }
  if (!globals.campusDb)
    globals.campusDb = drizzle(globals.campusPool, { schema });
  return globals.campusDb;
}
export type Executor = Pick<NodePgDatabase, "execute">;
export async function rows<T = Record<string, unknown>>(
  statement: SQL,
  executor: Executor = database(),
): Promise<T[]> {
  const result = await executor.execute(statement);
  return result.rows as T[];
}
export async function one<T = Record<string, unknown>>(
  statement: SQL,
  executor?: Executor,
): Promise<T | undefined> {
  return (await rows<T>(statement, executor))[0];
}
export async function closeDatabase() {
  await globals.campusPool?.end();
  globals.campusPool = undefined;
  globals.campusDb = undefined;
}
