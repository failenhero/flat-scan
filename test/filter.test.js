import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetAreasOnly } from '../src/filter.js';

const grossGerau = {
  uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'flat in Groß-Gerau',
  address: 'Danziger Straße 1, 64521 Groß-Gerau',
  url: 'https://example.com/a/',
  thumbnailUrl: '',
};

const nauheim = {
  uuid: '88888888-8888-8888-8888-888888888888',
  title: 'flat in Nauheim',
  address: 'Waldstraße 4, 64569 Nauheim',
  url: 'https://example.com/h/',
  thumbnailUrl: '',
};

const gernsheimerStrInRiedstadt = {
  uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  title: 'flat on Gernsheimer Straße',
  address: 'Gernsheimer Straße 10, 64560 Riedstadt',
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

const biebesheim = {
  uuid: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  title: 'flat in Biebesheim',
  address: 'Musterweg 3, 64584 Biebesheim am Rhein',
  url: 'https://example.com/e/',
  thumbnailUrl: '',
};

const stockstadt = {
  uuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  title: 'flat in Stockstadt',
  address: 'Rheinstraße 7, 64589 Stockstadt am Rhein',
  url: 'https://example.com/f/',
  thumbnailUrl: '',
};

const biblis = {
  uuid: '99999999-9999-9999-9999-999999999999',
  title: 'flat in Biblis',
  address: 'Darmstädter Straße 2, 68647 Biblis',
  url: 'https://example.com/g/',
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

test('targetAreasOnly keeps listings with postal code 64579', () => {
  assert.deepEqual(targetAreasOnly([gernsheim]), [gernsheim]);
});

test('targetAreasOnly keeps listings with postal code 64584', () => {
  assert.deepEqual(targetAreasOnly([biebesheim]), [biebesheim]);
});

test('targetAreasOnly keeps listings with postal code 64589', () => {
  assert.deepEqual(targetAreasOnly([stockstadt]), [stockstadt]);
});

test('targetAreasOnly keeps listings with postal code 68647', () => {
  assert.deepEqual(targetAreasOnly([biblis]), [biblis]);
});

test('targetAreasOnly keeps listings with postal code 64521', () => {
  assert.deepEqual(targetAreasOnly([grossGerau]), [grossGerau]);
});

test('targetAreasOnly drops listings with other postal codes', () => {
  assert.deepEqual(targetAreasOnly([nauheim]), []);
});

test('targetAreasOnly does not false-match "Gernsheimer Straße" in another town', () => {
  assert.deepEqual(targetAreasOnly([gernsheimerStrInRiedstadt]), []);
});

test('targetAreasOnly does not match 64579 as substring of a larger number', () => {
  assert.deepEqual(targetAreasOnly([noisy64579Substring]), []);
});

test('targetAreasOnly preserves order and keeps only target-area entries from a mixed list', () => {
  const result = targetAreasOnly([
    grossGerau, nauheim, gernsheim, gernsheimerStrInRiedstadt, biebesheim, stockstadt, noisy64579Substring, biblis,
  ]);
  assert.deepEqual(result, [grossGerau, gernsheim, biebesheim, stockstadt, biblis]);
});

test('targetAreasOnly tolerates missing or null address', () => {
  const broken = { ...gernsheim, address: undefined };
  assert.deepEqual(targetAreasOnly([broken]), []);
});
