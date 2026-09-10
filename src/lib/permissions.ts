import type { User } from "./model";
import type { Section } from "./workspace-navigation";

export const roleLabels: Record<User["role"], string> = {
  admin: "Administrator",
  operator: "Operator",
  viewer: "Pembaca",
};

export function isUserRole(value: unknown): value is User["role"] {
  return value === "admin" || value === "operator" || value === "viewer";
}

export type Permission =
  | "archives:read" | "archives:write" | "archives:export" | "trash:read"
  | "documents:read" | "documents:write"
  | "employees:read" | "employees:write"
  | "honorariums:read" | "honorariums:write"
  | "vehicles:read" | "vehicles:write"
  | "users:manage" | "settings:manage";

const operatorPermissions: readonly Permission[] = [
  "archives:read", "archives:write", "archives:export", "trash:read",
  "documents:read", "documents:write", "employees:read", "employees:write",
  "honorariums:read", "honorariums:write", "vehicles:read", "vehicles:write",
];
const permissions: Record<User["role"], readonly Permission[]> = {
  admin: [...operatorPermissions, "users:manage", "settings:manage"],
  operator: operatorPermissions,
  viewer: ["archives:read"],
};

/** Shared by UI and server; unknown roles and permissions never grant access. */
export function can(user: Pick<User, "role"> | null | undefined, permission: Permission): boolean {
  return !!user && isUserRole(user.role) && permissions[user.role].includes(permission);
}

export function requirePermission(user: Pick<User, "role">, permission: Permission) {
  if (!can(user, permission)) throw new Error("FORBIDDEN");
}

export function canAccessSection(user: Pick<User, "role"> | null | undefined, section: Section): boolean {
  switch (section) {
    case "home": case "archives": case "taskLetters": case "reports": return can(user, "archives:read");
    case "documents": return can(user, "documents:read");
    case "people": return can(user, "employees:read");
    case "honorarium": return can(user, "honorariums:read");
    case "trash": return can(user, "trash:read");
    // Operators retain the existing settings overview; only admins can change settings.
    case "settings": return can(user, "archives:write");
    default: return false;
  }
}
