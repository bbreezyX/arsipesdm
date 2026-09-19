import { z } from "zod";
import type { User } from "./model";
import { can } from "./permissions";

export const onboardingIds = ["archive-guide", "create-archive", "import-excel", "documents"] as const;
export type OnboardingId = (typeof onboardingIds)[number];
export type OnboardingStatus = "dismissed" | "completed";
export type OnboardingProgress = Partial<Record<OnboardingId, OnboardingStatus>>;
export const onboardingUpdate = z.object({
  id: z.enum(onboardingIds),
  status: z.enum(["dismissed", "completed"]),
}).strict();

export function canUseOnboarding(user: Pick<User, "role">, id: OnboardingId) {
  return can(user, id === "archive-guide" ? "archives:read" : id === "documents" ? "documents:write" : "archives:write");
}

export function onboardingKey(userId: string, id: OnboardingId) {
  return `onboarding:v1:${userId}:${id}`;
}

/** Storage is optional and may contain older or incomplete values. */
export function parseOnboardingProgress(value: unknown): OnboardingProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const progress: OnboardingProgress = {};
  for (const id of onboardingIds) {
    const status = (value as Record<string, unknown>)[id];
    if (status === "dismissed" || status === "completed") progress[id] = status;
  }
  return progress;
}
