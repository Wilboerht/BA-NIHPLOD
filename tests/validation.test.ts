import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContainsPattern,
  buildPrefixPattern,
  escapeLikePattern,
  getTodayISO,
  isFutureDate,
  isSafeEvidenceUrl,
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

test('date helpers use the business timezone', () => {
  const noonShanghai = new Date(Date.UTC(2026, 10, 6, 4, 0, 0));
  assert.equal(getTodayISO(noonShanghai), '2026-11-06');
  assert.equal(isFutureDate('2026-11-07', noonShanghai), true);
  assert.equal(isFutureDate('2026-11-06', noonShanghai), false);

  const beforeMidnight = new Date(Date.UTC(2026, 10, 5, 15, 59, 0));
  const afterMidnight = new Date(Date.UTC(2026, 10, 5, 16, 0, 0));
  assert.equal(getTodayISO(beforeMidnight), '2026-11-05');
  assert.equal(getTodayISO(afterMidnight), '2026-11-06');
});

test('isSafeEvidenceUrl only accepts private complaint evidence paths', () => {
  assert.equal(
    isSafeEvidenceUrl('/api/files/complaints/4f6c7d8e-1234-4abc-8def-0123456789ab.png'),
    true
  );
  assert.equal(
    isSafeEvidenceUrl('/api/files/complaints/../../../.env.local'),
    false
  );
  assert.equal(
    isSafeEvidenceUrl('/api/files/complaints/4f6c7d8e-1234-4abc-8def-0123456789ab.svg'),
    false
  );
  assert.equal(
    isSafeEvidenceUrl('https://evil.example.com/a.png'),
    false
  );
});

test('validateFileMagic accepts ICC JPEG and rejects fake webp', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe2, 0x00, 0x00]);
  assert.equal(validateFileMagic(jpeg, 'image/jpeg'), true);

  const riffOnly = Buffer.from('RIFF0000AVI ', 'ascii');
  assert.equal(validateFileMagic(riffOnly, 'image/webp'), false);

  const webp = Buffer.from('RIFF0000WEBP', 'ascii');
  assert.equal(validateFileMagic(webp, 'image/webp'), true);
});
