import { Pool } from "pg";

export const dbFotos = new Pool({
  host: import.meta.env.DB_HOST,
  port: Number(import.meta.env.DB_PORT),
  database: import.meta.env.DB_FOTOS_NAME,
  user: import.meta.env.DB_USER,
  password: import.meta.env.DB_PASSWORD,
});