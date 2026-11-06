import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContainsPattern,
  buildPrefixPattern,
  escapeLikePattern,
  getTodayISO,
  isFutureDate,
  isUuid,
  parseDateOnly,
} from '../lib/validation.ts';
import { validateFileMagic } from '../lib/storage.ts';

test('escapeLikePattern escapes SQL LIKE metacharacters', () => {
  assert.equal(escapeLikePattern('100%_a\\b'), '100\\%\\_a\\\\b');
  assert.equal(buildContainsPattern('%'), '%\\%%');
  assert.equal(buildPrefixPattern('_'), '\\_%');
});

test('isUuid validates UUID strings', () => {
  assert.equal(isUuid('a3968a41-77d3-7add-5283-86bd049cde53'), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(isUuid('a3968a41-77d3-7add-5283-86bd049cde5'), false);
});

test('parseDateOnly rejects normalized invalid dates', () => {
  assert.deepEqual(parseDateOnly('2026-02-28')?.iso, '2026-02-28');
  assert.equal(parseDateOnly('2026-02-30'), null);
  assert.equal(parseDateOnly('2026-13-01'), null);
  assert.equal(parseDateOnly('2026-2-1'), null);
});

test('date helpers use local date strings', () => {
  const now = new Date(2026, 10, 6, 12, 0, 0);
  assert.equal(getTodayISO(now), '2026-11-06');
  assert.equal(isFutureDate('2026-11-07', now), true);
  assert.equal(isFutureDate('2026-11-06', now), false);
});

test('validateFileMagic accepts ICC JPEG and rejects fake webp', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe2, 0x00, 0x00]);
  assert.equal(validateFileMagic(jpeg, 'image/jpeg'), true);

  const riffOnly = Buffer.from('RIFF0000AVI ', 'ascii');
  assert.equal(validateFileMagic(riffOnly, 'image/webp'), false);

  const webp = Buffer.from('RIFF0000WEBP', 'ascii');
  assert.equal(validateFileMagic(webp, 'image/webp'), true);
});
