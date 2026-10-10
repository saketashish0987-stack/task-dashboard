import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.ATTENDANCE_DATA_DIR || path.join(here, 'data');

const ensureDir = () => fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

/** Read a JSON file, returning `fallback` if it does not exist. */
export const readJson = (name, fallback) => {
  const file = path.join(DATA_DIR, name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

/** Write JSON atomically (write temp file, then rename) so a crash cannot corrupt it. */
export const writeJson = (name, value) => {
  ensureDir();
  const file = path.join(DATA_DIR, name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
};
