import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function load(path) {
  let text;
  try {
    text = await fs.readFile(path, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { seen: new Set(), isFirstRun: true };
    }
    throw e;
  }
  const parsed = JSON.parse(text);
  return { seen: new Set(parsed.seenUuids ?? []), isFirstRun: false };
}

export async function save(path, seen) {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${randomUUID()}`;
  const data = JSON.stringify({ seenUuids: [...seen] }, null, 2);
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, path);
}
