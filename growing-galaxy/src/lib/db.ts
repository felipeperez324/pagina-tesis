// Importamos Pool desde la librería pg.
// Pool permite mantener y reutilizar conexiones con PostgreSQL.
import { Pool } from "pg";

// Creamos el pool de conexiones a la base de datos.
// Los datos de conexión se obtienen desde las variables del archivo .env.
export const db = new Pool({
  // Dirección donde está funcionando PostgreSQL.
  host: import.meta.env.DB_HOST,

  // Puerto de PostgreSQL.
  // Number() convierte el valor de texto a número.
  port: Number(import.meta.env.DB_PORT),

  // Nombre de la base de datos.
  database: import.meta.env.DB_NAME,

  // Usuario de PostgreSQL.
  user: import.meta.env.DB_USER,

  // Contraseña del usuario de PostgreSQL.
  password: import.meta.env.DB_PASSWORD,
});