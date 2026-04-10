import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

const dbPath = process.env.DB_PATH ?? "./dev.db";
const client = createClient({ url: `file:${dbPath}` });
export const db = drizzle(client, { schema });
export type DB = typeof db;
