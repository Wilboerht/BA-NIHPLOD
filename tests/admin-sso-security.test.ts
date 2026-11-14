import test from "node:test";
import assert from "node:assert/strict";
import { generateSync } from "otplib";
import {
  canonicalizeQuery,
  generateInternalActorSignature,
  generateInternalApiSignature,
  hashRequestBody,
  verifyInternalActorSignature,
  verifyInternalApiSignature,
  getInternalApiKeys,
} from "../lib/internal-api.ts";
import { canTransitionComplaintStatus } from "../lib/complaint-status.ts";
import { verifyBreakGlassTotp } from "../lib/totp.ts";
import { createEvidenceToken, verifyEvidenceToken } from "../lib/evidence-token.ts";

process.env.INTERNAL_API_KEYS = JSON.stringify([
  {
    project: "ba",
    key: "test-ba-key",
    secret: "0123456789abcdef0123456789abcdef",
  },
]);
process.env.BA_EVIDENCE_TOKEN_SECRET = "evidence-secret-at-least-32-characters";

test("internal API signature is query-bound and tamper-evident", () => {
  const body = JSON.stringify({ complaintId: "c1" });
  const query = canonicalizeQuery("page=1&status=PENDING");
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = "nonce-1";
  const bodyHash = hashRequestBody(body);
  const signature = generateInternalApiSignature(
    "0123456789abcdef0123456789abcdef",
    "POST",
    "/api/internal/admin/complaints",
    timestamp,
    nonce,
    bodyHash,
    query
  );

  assert.ok(
    verifyInternalApiSignature(
      "test-ba-key",
      signature,
      "POST",
      "/api/internal/admin/complaints",
      timestamp,
      nonce,
      bodyHash,
      query
    )
  );
  assert.equal(
    verifyInternalApiSignature(
      "test-ba-key",
      signature,
      "POST",
      "/api/internal/admin/complaints",
      timestamp,
      nonce,
      hashRequestBody(`${body} `),
      query
    ),
    null
  );
});

test("internal actor header is HMAC-bound", () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = "nonce-actor-1";
  const actor = "eyJpZCI6ImFkbWluLTEifQ";
  const signature = generateInternalActorSignature(
    "0123456789abcdef0123456789abcdef",
    timestamp,
    nonce,
    actor,
  );
  const config = getInternalApiKeys().keys.get("test-ba-key");
  assert.ok(config);
  assert.equal(
    verifyInternalActorSignature(config!, timestamp, nonce, actor, signature),
    true,
  );
  assert.equal(
    verifyInternalActorSignature(
      config!,
      timestamp,
      nonce,
      `${actor}-tampered`,
      signature,
    ),
    false,
  );
});

test("complaint status transitions match design", () => {
  assert.equal(canTransitionComplaintStatus("PENDING", "INVESTIGATING"), true);
  assert.equal(canTransitionComplaintStatus("PENDING", "RESOLVED"), true);
  assert.equal(canTransitionComplaintStatus("INVESTIGATING", "RESOLVED"), true);
  assert.equal(canTransitionComplaintStatus("RESOLVED", "REJECTED"), false);
  assert.equal(canTransitionComplaintStatus("REJECTED", "PENDING"), false);
});

test("break-glass TOTP verifies once and rejects replay", () => {
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const token = generateSync({ secret });
  assert.equal(verifyBreakGlassTotp(token, secret), true);
  assert.equal(verifyBreakGlassTotp(token, secret), false);
  assert.equal(verifyBreakGlassTotp("000000", secret), false);
});

test("evidence token is bound to complaint/index and expiry", () => {
  const { exp, token } = createEvidenceToken("complaint-1", 0);
  assert.equal(verifyEvidenceToken("complaint-1", 0, exp, token), true);
  assert.equal(verifyEvidenceToken("complaint-1", 1, exp, token), false);
  assert.equal(verifyEvidenceToken("complaint-2", 0, exp, token), false);
  assert.equal(verifyEvidenceToken("complaint-1", 0, exp, "0".repeat(64)), false);
});
