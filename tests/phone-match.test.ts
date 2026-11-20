import test from 'node:test';
import assert from 'node:assert/strict';
import { NON_DIGIT_PATTERN, normalizeContactPhone } from '../lib/phone-match.ts';

test('NON_DIGIT_PATTERN is a literal backslash-D for PostgreSQL regexp_replace', () => {
  assert.equal(NON_DIGIT_PATTERN, '\\D');
});

test('normalizeContactPhone strips country code spacing and separators', () => {
  assert.equal(normalizeContactPhone('+86 138-0013-8000'), '8613800138000');
});
