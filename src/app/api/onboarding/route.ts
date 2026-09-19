import { context, checkOrigin, apiError } from "@/lib/auth";
import { db } from "@/lib/db";
import { canUseOnboarding, onboardingIds, onboardingKey, onboardingUpdate, type OnboardingProgress } from "@/lib/onboarding";

const noStore = { headers: { "Cache-Control": "private, no-store" } };

export async function GET() {
  try {
    const { user, workspace } = await context();
    if (workspace === "demo") return Response.json({}, noStore);
    const ids = onboardingIds.filter(id => canUseOnboarding(user, id));
    const keys = ids.map(id => onboardingKey(user.id, id));
    const rows = await db.prepare(`SELECT key,value FROM pengaturan WHERE key IN (${keys.map(() => "?").join(",")})`)
      .all(...keys) as { key: string; value: string }[];
    const progress: OnboardingProgress = {};
    for (const id of ids) {
      const value = rows.find(row => row.key === onboardingKey(user.id, id))?.value;
      if (value === "completed" || value === "dismissed") progress[id] = value;
    }
    return Response.json(progress, noStore);
  } catch (error) { return apiError(error); }
}

export async function PATCH(req: Request) {
  try {
    checkOrigin(req);
    const { user, workspace } = await context();
    const result = onboardingUpdate.safeParse(await req.json());
    if (!result.success) return Response.json({ error: "Pilihan panduan tidak valid." }, { status: 400 });
    const { id, status } = result.data;
    if (!canUseOnboarding(user, id)) throw new Error("FORBIDDEN");
    if (workspace !== "demo") {
      await db.prepare("INSERT INTO pengaturan(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .run(onboardingKey(user.id, id), status);
    }
    return Response.json({ ok: true }, noStore);
  } catch (error) { return apiError(error); }
}
