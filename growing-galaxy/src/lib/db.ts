import { Pool } from "pg";

export const db = new Pool({
  host: import.meta.env.DB_HOST,
  port: Number(import.meta.env.DB_PORT),
  database: import.meta.env.DB_NAME,
  user: import.meta.env.DB_USER,
  password: import.meta.env.DB_PASSWORD,
});