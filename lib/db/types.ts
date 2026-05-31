import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Drizzle database handle accepted by service modules. Both the production
 * postgres-js instance (`initDb`) and the PGlite test instance (`makeTestDb`)
 * are `PgDatabase` subtypes over the same schema, so services depend on this
 * shared surface instead of a concrete driver.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
