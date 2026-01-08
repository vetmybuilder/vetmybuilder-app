// e2e-tests/src/db/mysql.ts
import mysql from "mysql2/promise";

export async function connect(options: {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
}) {
  return mysql.createConnection({
    multipleStatements: true,
    ...options,
  });
}
