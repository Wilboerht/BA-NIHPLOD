import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveCertificateStatus } from '../lib/certificate-status.ts';

test('getEffectiveCertificateStatus computes the public status', () => {
  assert.equal(getEffectiveCertificateStatus('ISSUED', '2026-11-01', '2026-12-01', '2026-11-07'), 'ISSUED');
  assert.equal(getEffectiveCertificateStatus('ISSUED', '2026-11-08', '2026-12-01', '2026-11-07'), 'UPCOMING');
  assert.equal(getEffectiveCertificateStatus('ISSUED', '2026-10-01', '2026-11-06', '2026-11-07'), 'EXPIRED');
  assert.equal(getEffectiveCertificateStatus('REVOKED', '2026-11-01', '2026-12-01', '2026-11-07'), 'REVOKED');
  assert.equal(getEffectiveCertificateStatus('EXPIRED', '2026-10-01', '2026-10-31', '2026-11-07'), 'EXPIRED');
  assert.equal(getEffectiveCertificateStatus('PENDING', '2026-11-01', '2026-12-01', '2026-11-07'), null);
  assert.equal(getEffectiveCertificateStatus('REJECTED', '2026-11-01', '2026-12-01', '2026-11-07'), null);
});
