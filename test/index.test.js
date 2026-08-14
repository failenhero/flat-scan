import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { check } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'bgr-immomio-index.html');

async function freshTmpDir() {
  return mkdtemp(join(tmpdir(), 'flats-scan-int-'));
}

async function fixtureWithGernsheimEntry() {
  const html = await readFile(FIXTURE, 'utf8');
  const $ = cheerio.load(html);
  // Take the first listing and rewrite its address to Gernsheim
  const first = $('div.property').first();
  first.find('.property-subtitle').text('Beispielstraße 5, 64579 Gernsheim am Rhein');
  return $.html();
}

async function fixtureMissingContainer() {
  const html = await readFile(FIXTURE, 'utf8');
  const $ = cheerio.load(html);
  $('div.properties').remove();
  return $.html();
}

function makeDeps({ html, statePath, heartbeatPath }) {
  const sent = [];
  const config = {
    sourceUrl: 'http://fake/',
    statePath,
    heartbeatPath,
    contactEmail: 't@example.com',
  };
  return {
    sent,
    deps: {
      config,
      fetchFn: async () => html,
      mailerFn: async (listing) => {
        sent.push(listing);
      },
    },
  };
}

test('first run with no Gernsheim listings: no emails, baseline empty, heartbeat written', async () => {
  const dir = await freshTmpDir();
  try {
    const html = await readFile(FIXTURE, 'utf8');
    const { sent, deps } = makeDeps({
      html,
      statePath: join(dir, 'state.json'),
      heartbeatPath: join(dir, 'last-tick'),
    });
    await check(deps);
    assert.equal(sent.length, 0, 'no emails should be sent on first run');

    const stateText = await readFile(join(dir, 'state.json'), 'utf8');
    assert.match(stateText, /"seenUuids":\s*\[\s*\]/);

    const hbText = await readFile(join(dir, 'last-tick'), 'utf8');
    assert.match(hbText, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('first run with one Gernsheim listing: no email, listing baselined', async () => {
  const dir = await freshTmpDir();
  try {
    const html = await fixtureWithGernsheimEntry();
    const { sent, deps } = makeDeps({
      html,
      statePath: join(dir, 'state.json'),
      heartbeatPath: join(dir, 'last-tick'),
    });
    await check(deps);
    assert.equal(sent.length, 0, 'first run is silent even when Gernsheim listings exist');

    const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
    assert.equal(state.seenUuids.length, 1, 'one Gernsheim UUID should be baselined');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('second run with same Gernsheim listing: no emails (already seen)', async () => {
  const dir = await freshTmpDir();
  try {
    const html = await fixtureWithGernsheimEntry();
    const statePath = join(dir, 'state.json');
    const heartbeatPath = join(dir, 'last-tick');

    // First run: bootstrap
    const first = makeDeps({ html, statePath, heartbeatPath });
    await check(first.deps);

    // Second run: same data
    const second = makeDeps({ html, statePath, heartbeatPath });
    await check(second.deps);
    assert.equal(second.sent.length, 0, 'unchanged Gernsheim listing must not re-email');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('second run with NEW Gernsheim listing: email sent, state updated', async () => {
  const dir = await freshTmpDir();
  try {
    const baselineHtml = await readFile(FIXTURE, 'utf8'); // no Gernsheim
    const newHtml = await fixtureWithGernsheimEntry(); // 1 Gernsheim

    const statePath = join(dir, 'state.json');
    const heartbeatPath = join(dir, 'last-tick');

    // First run: empty baseline
    const first = makeDeps({ html: baselineHtml, statePath, heartbeatPath });
    await check(first.deps);
    assert.equal(first.sent.length, 0);

    // Second run: a new Gernsheim listing appears
    const second = makeDeps({ html: newHtml, statePath, heartbeatPath });
    await check(second.deps);
    assert.equal(second.sent.length, 1, 'one email per new Gernsheim listing');

    const state = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(state.seenUuids.length, 1);
    assert.equal(state.seenUuids[0], second.sent[0].uuid);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('parse failure (missing container): state untouched, heartbeat NOT updated', async () => {
  const dir = await freshTmpDir();
  try {
    const statePath = join(dir, 'state.json');
    const heartbeatPath = join(dir, 'last-tick');

    // Establish a baseline with one Gernsheim entry
    const seedHtml = await fixtureWithGernsheimEntry();
    const seed = makeDeps({ html: seedHtml, statePath, heartbeatPath });
    await check(seed.deps);
    const stateBefore = await readFile(statePath, 'utf8');
    const hbBefore = await readFile(heartbeatPath, 'utf8');

    // Force a layout-regression on the next tick
    const brokenHtml = await fixtureMissingContainer();
    const broken = makeDeps({ html: brokenHtml, statePath, heartbeatPath });
    await check(broken.deps);

    const stateAfter = await readFile(statePath, 'utf8');
    const hbAfter = await readFile(heartbeatPath, 'utf8');
    assert.equal(stateAfter, stateBefore, 'state must not change on parse failure');
    assert.equal(hbAfter, hbBefore, 'heartbeat must not advance on parse failure');
    assert.equal(broken.sent.length, 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('fetch failure: state untouched, heartbeat NOT updated', async () => {
  const dir = await freshTmpDir();
  try {
    const statePath = join(dir, 'state.json');
    const heartbeatPath = join(dir, 'last-tick');

    // Seed
    const seedHtml = await readFile(FIXTURE, 'utf8');
    const seed = makeDeps({ html: seedHtml, statePath, heartbeatPath });
    await check(seed.deps);
    const stateBefore = await readFile(statePath, 'utf8');
    const hbBefore = await readFile(heartbeatPath, 'utf8');

    // Tick with a fetcher that throws
    const sent = [];
    await check({
      config: {
        sourceUrl: 'http://fake/',
        statePath,
        heartbeatPath,
        contactEmail: 't@example.com',
      },
      fetchFn: async () => {
        throw new Error('connection refused');
      },
      mailerFn: async (l) => sent.push(l),
    });

    assert.equal(await readFile(statePath, 'utf8'), stateBefore);
    assert.equal(await readFile(heartbeatPath, 'utf8'), hbBefore);
    assert.equal(sent.length, 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('mailer failure: UUID NOT marked seen, retried next tick', async () => {
  const dir = await freshTmpDir();
  try {
    const statePath = join(dir, 'state.json');
    const heartbeatPath = join(dir, 'last-tick');

    // Bootstrap with no Gernsheim listings
    const baseline = makeDeps({
      html: await readFile(FIXTURE, 'utf8'),
      statePath,
      heartbeatPath,
    });
    await check(baseline.deps);

    const newHtml = await fixtureWithGernsheimEntry();
    let mailCalls = 0;

    // Tick 1: mailer fails
    await check({
      config: {
        sourceUrl: 'http://fake/',
        statePath,
        heartbeatPath,
        contactEmail: 't@example.com',
      },
      fetchFn: async () => newHtml,
      mailerFn: async () => {
        mailCalls++;
        throw new Error('SMTP transient');
      },
    });
    const stateAfterFail = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(stateAfterFail.seenUuids.length, 0, 'UUID must NOT be marked seen on mail failure');

    // Tick 2: mailer succeeds — same UUID retried
    const tick2 = makeDeps({ html: newHtml, statePath, heartbeatPath });
    await check(tick2.deps);
    assert.equal(mailCalls, 1);
    assert.equal(tick2.sent.length, 1, 'failed listing must be retried');

    const stateAfterSuccess = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(stateAfterSuccess.seenUuids.length, 1);
  } finally {
    await rm(dir, { recursive: true });
  }
});
