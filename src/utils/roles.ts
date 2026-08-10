export type UserRole = "admin" | "observe";

export function normalizeRole(value: unknown): UserRole {
  return value === "observe" ? "observe" : "admin";
}

export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === "admin";
}
