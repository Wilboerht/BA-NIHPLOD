export interface CertificateAccessUser {
  role?: string | null;
  auth_source?: string | null;
  permissions?: string[] | null;
}

export const CERTIFICATE_PERMISSIONS = {
  read: "ba:certificates:read",
  download: "ba:certificates:download",
  submit: "ba:certificates:submit",
  issue: "ba:certificates:issue",
  update: "ba:certificates:update",
  revoke: "ba:certificates:revoke",
  delete: "ba:certificates:delete",
  sensitive: "ba:certificates:sensitive:read",
} as const;

export type CertificatePermission =
  (typeof CERTIFICATE_PERMISSIONS)[keyof typeof CERTIFICATE_PERMISSIONS];

const CERTIFICATE_PERMISSION_SET = new Set<string>(
  Object.values(CERTIFICATE_PERMISSIONS),
);

export function normalizeBaPermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && item.startsWith("ba:"),
      ),
    ),
  ].sort();
}

export function hasCertificatePermission(
  user: CertificateAccessUser,
  permission: CertificatePermission,
): boolean {
  // 本地 break-glass 超级管理员用于灾难恢复；SSO 管理员严格按主站同步权限。
  if (user.auth_source !== "sso" && user.role === "SUPER_ADMIN") return true;
  return (user.permissions ?? []).includes(permission);
}

export function hasAnyCertificatePermission(
  user: CertificateAccessUser,
  permissions: readonly CertificatePermission[],
): boolean {
  return permissions.some((permission) =>
    hasCertificatePermission(user, permission),
  );
}

export function isCertificatePermission(
  value: string,
): value is CertificatePermission {
  return CERTIFICATE_PERMISSION_SET.has(value);
}
