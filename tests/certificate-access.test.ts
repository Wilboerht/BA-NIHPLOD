import test from "node:test";
import assert from "node:assert/strict";
import {
  CERTIFICATE_PERMISSIONS,
  hasCertificatePermission,
  normalizeBaPermissions,
} from "../lib/certificate/access.ts";

test("certificate permissions are normalized and filtered", () => {
  assert.deepEqual(
    normalizeBaPermissions([
      "ba:certificates:issue",
      "ba:access",
      "ba:certificates:issue",
      "users:read",
    ]),
    ["ba:access", "ba:certificates:issue"],
  );
  assert.deepEqual(normalizeBaPermissions(null), []);
});

test("SSO admins use synced capabilities instead of role alone", () => {
  const issueOnly = {
    role: "AUDITOR",
    auth_source: "sso",
    permissions: [CERTIFICATE_PERMISSIONS.issue],
  };
  assert.equal(
    hasCertificatePermission(issueOnly, CERTIFICATE_PERMISSIONS.issue),
    true,
  );
  assert.equal(
    hasCertificatePermission(issueOnly, CERTIFICATE_PERMISSIONS.revoke),
    false,
  );

  const superWithoutCapability = {
    role: "SUPER_ADMIN",
    auth_source: "sso",
    permissions: [],
  };
  assert.equal(
    hasCertificatePermission(
      superWithoutCapability,
      CERTIFICATE_PERMISSIONS.issue,
    ),
    false,
  );
});

test("local break-glass super admin retains emergency certificate access", () => {
  assert.equal(
    hasCertificatePermission(
      { role: "SUPER_ADMIN", auth_source: "local", permissions: [] },
      CERTIFICATE_PERMISSIONS.delete,
    ),
    true,
  );
  assert.equal(
    hasCertificatePermission(
      { role: "AUDITOR", auth_source: "local", permissions: [] },
      CERTIFICATE_PERMISSIONS.delete,
    ),
    false,
  );
});
