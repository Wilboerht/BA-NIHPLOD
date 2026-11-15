export interface ComplaintAccessUser {
  role?: string | null;
  auth_source?: string | null;
  permissions?: string[] | null;
}

function hasPermission(user: ComplaintAccessUser, permission: string): boolean {
  if (user.auth_source !== "sso" && user.role === "SUPER_ADMIN") return true;
  return (user.permissions ?? []).includes(permission);
}

export function canReadComplaints(user: ComplaintAccessUser): boolean {
  return (
    hasPermission(user, "ba:complaints:read") ||
    hasPermission(user, "ba:complaints:write") ||
    hasPermission(user, "ba:complaints:delete") ||
    hasPermission(user, "ba:complaints:sensitive:read")
  );
}

export function canWriteComplaints(user: ComplaintAccessUser): boolean {
  return hasPermission(user, "ba:complaints:write");
}

export function canDeleteComplaints(user: ComplaintAccessUser): boolean {
  return hasPermission(user, "ba:complaints:delete");
}

export function canReadSensitiveComplaints(user: ComplaintAccessUser): boolean {
  return hasPermission(user, "ba:complaints:sensitive:read");
}
