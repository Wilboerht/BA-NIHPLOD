import test from 'node:test';
import assert from 'node:assert/strict';
import { getClientIp, normalizeClientIp } from '../lib/request-ip.ts';

test('normalizeClientIp accepts IPv4/IPv6 and rejects invalid values', () => {
  assert.equal(normalizeClientIp('203.0.113.9'), '203.0.113.9');
  assert.equal(normalizeClientIp('[2001:db8::1]'), '2001:db8::1');
  assert.equal(normalizeClientIp('not-an-ip'), null);
});

test('getClientIp prefers x-real-ip and uses the last forwarded hop', () => {
  const realIp = new Headers({
    'x-real-ip': '203.0.113.9',
    'x-forwarded-for': '198.51.100.1, 203.0.113.9',
    'cf-connecting-ip': '192.0.2.10',
  });
  assert.equal(getClientIp(realIp), '203.0.113.9');

  const forwarded = new Headers({
    'x-forwarded-for': '198.51.100.1, 203.0.113.9',
  });
  assert.equal(getClientIp(forwarded), '203.0.113.9');

  const cloudflare = new Headers({
    'x-forwarded-for': '198.51.100.1',
    'cf-connecting-ip': '192.0.2.10',
  });
  assert.equal(getClientIp(cloudflare), '192.0.2.10');

  assert.equal(getClientIp(new Headers({ 'x-real-ip': 'invalid' })), 'unknown');
});
