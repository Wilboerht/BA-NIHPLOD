import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import {
  AdminStepUpTicketError,
  stepUpClaimMismatch,
  verifyAdminStepUpTicketWithConfig,
  type AdminStepUpClaims,
  type AdminStepUpVerifyConfig,
} from "../lib/admin-step-up-ticket-core.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const config: AdminStepUpVerifyConfig = {
  publicKey,
  jwksUrl: "https://main.test/api/oauth/jwks",
  issuer: "https://main.test",
  clientId: "ba-admin",
};
const audience = "ba-admin-stepup";

async function makeTicket(
  overrides: Record<string, unknown> = {},
  expiresIn = "120s",
): Promise<string> {
  const key = await importPKCS8(privateKey, "RS256");
  return new SignJWT({
    token_use: "admin_step_up",
    client_id: "ba-admin",
    sub: "admin-1",
    state: "s".repeat(43),
    action: "ba.certificates.issue",
    resource_id: "new",
    ver: 1,
    totp: true,
    mainSessionExp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "test-key" })
    .setIssuer("https://main.test")
    .setAudience("ba-admin-stepup")
    .setJti("jti-1")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AdminStepUpTicketError);
    assert.equal(error.code, code);
    return true;
  });
}

test("verifies a valid step-up ticket", async () => {
  const ticket = await makeTicket();
  const claims = await verifyAdminStepUpTicketWithConfig(ticket, config, audience);
  assert.equal(claims.sub, "admin-1");
  assert.equal(claims.client_id, "ba-admin");
  assert.equal(claims.state, "s".repeat(43));
  assert.equal(claims.action, "ba.certificates.issue");
  assert.equal(claims.resource_id, "new");
  assert.equal(claims.totp, true);
  assert.equal(claims.jti, "jti-1");
});

test("rejects wrong audience, client, TOTP, and expired main session", async () => {
  await expectCode(
    verifyAdminStepUpTicketWithConfig(await makeTicket(), config, "other-audience"),
    "INVALID_TICKET",
  );
  await expectCode(
    verifyAdminStepUpTicketWithConfig(
      await makeTicket({ client_id: "other-client" }),
      config,
      audience,
    ),
    "INVALID_TICKET",
  );
  await expectCode(
    verifyAdminStepUpTicketWithConfig(
      await makeTicket({ totp: false }),
      config,
      audience,
    ),
    "INVALID_TICKET",
  );
  await expectCode(
    verifyAdminStepUpTicketWithConfig(
      await makeTicket({ mainSessionExp: Math.floor(Date.now() / 1000) - 1 }),
      config,
      audience,
    ),
    "MAIN_SESSION_EXPIRED",
  );
});

test("rejects an expired or malformed ticket", async () => {
  await expectCode(
    verifyAdminStepUpTicketWithConfig(await makeTicket({}, "-60s"), config, audience),
    "INVALID_TICKET",
  );
  await expectCode(
    verifyAdminStepUpTicketWithConfig("not-a-jwt", config, audience),
    "INVALID_TICKET",
  );
});

test("claim binding rejects admin, client, state, action, and resource mismatch", () => {
  const claims: AdminStepUpClaims = {
    sub: "admin-1",
    client_id: "ba-admin",
    state: "s".repeat(43),
    action: "ba.certificates.issue",
    resource_id: "new",
    ver: 1,
    totp: true,
    mainSessionExp: Math.floor(Date.now() / 1000) + 600,
    jti: "jti-1",
    exp: Math.floor(Date.now() / 1000) + 120,
  };
  const request = {
    externalAdminId: "admin-1",
    action: "ba.certificates.issue",
    resourceId: "new",
  };
  assert.equal(stepUpClaimMismatch(claims, request, "ba-admin", claims.state), null);
  assert.equal(
    stepUpClaimMismatch(claims, { ...request, externalAdminId: "admin-2" }, "ba-admin", claims.state),
    "admin",
  );
  assert.equal(stepUpClaimMismatch(claims, request, "other-client", claims.state), "client");
  assert.equal(stepUpClaimMismatch(claims, request, "ba-admin", "x".repeat(43)), "state");
  assert.equal(
    stepUpClaimMismatch(claims, { ...request, action: "ba.certificates.revoke" }, "ba-admin", claims.state),
    "action",
  );
  assert.equal(
    stepUpClaimMismatch(claims, { ...request, resourceId: "0f8fad5b-d9cb-469f-a165-70867728950e" }, "ba-admin", claims.state),
    "resource",
  );
});
