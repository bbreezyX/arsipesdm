import { apiError, checkOrigin, context } from "@/lib/auth";
import { saveBudgets } from "@/lib/budget-db";
import { budgetListSchema } from "@/lib/budgets";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const c = await context("archives:write");
    const parsed = budgetListSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 422 });
    return Response.json(await saveBudgets(c.workspace, parsed.data));
  } catch (error) { return apiError(error); }
}
