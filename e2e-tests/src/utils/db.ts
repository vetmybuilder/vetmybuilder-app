// src/utils/db.ts
import fs from 'fs';
import path from 'path';

export function resetDb(dbPath: string) {
  const abs = path.resolve(process.cwd(), dbPath);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(abs)) fs.rmSync(abs);
  fs.writeFileSync(abs, '');
}
