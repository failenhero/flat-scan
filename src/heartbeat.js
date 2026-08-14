import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

export async function touch(path) {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, new Date().toISOString());
}
