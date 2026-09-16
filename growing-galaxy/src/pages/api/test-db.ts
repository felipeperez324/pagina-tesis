import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está siendo encontrada");
}

export const db = new Pool({
  connectionString,
});