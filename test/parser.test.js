import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as cheerio from 'cheerio';
import { parse } from '../src/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'bgr-immomio-index.html');

async function loadFixture() {
  return readFile(FIXTURE, 'utf8');
}

test('parse extracts listings from the live fixture', async () => {
  const html = await loadFixture();
  const result = parse(html);
  assert.notEqual(result, null);
  assert.ok(result.listings.length >= 5, `expected ≥5 listings, got ${result.listings.length}`);

  for (const l of result.listings) {
    assert.match(l.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.ok(l.title.length > 0, 'title must be non-empty');
    assert.ok(l.url.startsWith('https://bgr.immomio.online/'));
    assert.ok(l.address.length > 0, 'address must be non-empty');
  }
});

test('parse extracts the known first listing correctly', async () => {
  const html = await loadFixture();
  const { listings } = parse(html);
  const first = listings.find((l) => l.uuid === '22b58dcd-e30b-48d3-8c1b-3dac4de31cbf');
  assert.ok(first, 'expected to find the known UUID');
  assert.match(first.title, /Praktisch geschnittene 4-Zimmer Wohnung in Groß-Gerau/);
  assert.match(first.address, /Danziger Straße 1, 64521 Groß-Gerau/);
  assert.ok(first.thumbnailUrl.includes('immomakler/'), 'thumbnail should be present');
});

test('parse returns null when the listings container is missing', () => {
  const html = '<html><body><h1>Site under maintenance</h1></body></html>';
  assert.equal(parse(html), null);
});

test('parse returns empty listings when container is present but empty', () => {
  const html = '<html><body><div class="properties"></div></body></html>';
  const result = parse(html);
  assert.deepEqual(result, { listings: [] });
});

test('parse handles a fixture variant with the container removed', async () => {
  const html = await loadFixture();
  const $ = cheerio.load(html);
  $('div.properties').remove();
  assert.equal(parse($.html()), null);
});

test('parse skips entries that lack a UUID-shaped URL', () => {
  const html = `
    <div class="properties">
      <div class="property">
        <h3 class="property-title"><a href="https://example.com/no-uuid-here/">Bad</a></h3>
        <div class="property-subtitle">Somewhere</div>
      </div>
    </div>`;
  assert.deepEqual(parse(html), { listings: [] });
});
