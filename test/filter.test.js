import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gernsheimOnly } from '../src/filter.js';

const grossGerau = {
  uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'flat in Groß-Gerau',
  address: 'Danziger Straße 1, 64521 Groß-Gerau',
  url: 'https://example.com/a/',
  thumbnailUrl: '',
};

const gernsheimerStrInGG = {
  uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  title: 'flat on Gernsheimer Straße',
  address: 'Gernsheimer Straße 10, 64521 Groß-Gerau',
  url: 'https://example.com/b/',
  thumbnailUrl: '',
};

const gernsheim = {
  uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  title: 'flat in Gernsheim',
  address: 'Beispielstraße 5, 64579 Gernsheim am Rhein',
  url: 'https://example.com/c/',
  thumbnailUrl: '',
};

const noisy64579Substring = {
  uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  title: 'flat in Wiesbaden — irrelevant',
  // 164579 should NOT match \b64579\b because there's no word boundary
  // between "1" and "6". This guards the regex.
  address: 'Postfach 164579, 65189 Wiesbaden',
  url: 'https://example.com/d/',
  thumbnailUrl: '',
};

test('gernsheimOnly keeps listings with postal code 64579', () => {
  assert.deepEqual(gernsheimOnly([gernsheim]), [gernsheim]);
});

test('gernsheimOnly drops listings with other postal codes', () => {
  assert.deepEqual(gernsheimOnly([grossGerau]), []);
});

test('gernsheimOnly does not false-match "Gernsheimer Straße" in Groß-Gerau', () => {
  assert.deepEqual(gernsheimOnly([gernsheimerStrInGG]), []);
});

test('gernsheimOnly does not match 64579 as substring of a larger number', () => {
  assert.deepEqual(gernsheimOnly([noisy64579Substring]), []);
});

test('gernsheimOnly preserves order and keeps only Gernsheim entries from a mixed list', () => {
  const result = gernsheimOnly([grossGerau, gernsheim, gernsheimerStrInGG, noisy64579Substring]);
  assert.deepEqual(result, [gernsheim]);
});

test('gernsheimOnly tolerates missing or null address', () => {
  const broken = { ...gernsheim, address: undefined };
  assert.deepEqual(gernsheimOnly([broken]), []);
});
