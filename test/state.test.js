import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load, save } from '../src/state.js';

async function freshTmpDir() {
  return mkdtemp(join(tmpdir(), 'flats-scan-state-'));
}

test('load returns isFirstRun=true and empty set when file is missing', async () => {
  const dir = await freshTmpDir();
  try {
    const { seen, isFirstRun } = await load(join(dir, 'state.json'));
    assert.equal(isFirstRun, true);
    assert.equal(seen.size, 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('load returns isFirstRun=false when file exists, even if seenUuids is empty', async () => {
  const dir = await freshTmpDir();
  try {
    const path = join(dir, 'state.json');
    await writeFile(path, JSON.stringify({ seenUuids: [] }), 'utf8');
    const { seen, isFirstRun } = await load(path);
    assert.equal(isFirstRun, false);
    assert.equal(seen.size, 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('load reads previously saved UUIDs', async () => {
  const dir = await freshTmpDir();
  try {
    const path = join(dir, 'state.json');
    await writeFile(path, JSON.stringify({ seenUuids: ['a', 'b', 'c'] }), 'utf8');
    const { seen, isFirstRun } = await load(path);
    assert.equal(isFirstRun, false);
    assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('save → load is a round trip', async () => {
  const dir = await freshTmpDir();
  try {
    const path = join(dir, 'state.json');
    const original = new Set(['x', 'y']);
    await save(path, original);
    const { seen } = await load(path);
    assert.deepEqual([...seen].sort(), ['x', 'y']);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('save creates the parent directory if missing', async () => {
  const dir = await freshTmpDir();
  try {
    const path = join(dir, 'nested', 'subdir', 'state.json');
    await save(path, new Set(['z']));
    const text = await readFile(path, 'utf8');
    assert.match(text, /"seenUuids":\s*\[\s*"z"\s*\]/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('save uses a temp file and renames atomically (no .tmp left behind)', async () => {
  const dir = await freshTmpDir();
  try {
    const path = join(dir, 'state.json');
    await save(path, new Set(['p']));
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(dir);
    assert.deepEqual(files, ['state.json']);
  } finally {
    await rm(dir, { recursive: true });
  }
});
