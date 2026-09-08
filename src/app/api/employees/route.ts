import { context, checkOrigin, apiError } from "@/lib/auth";
import { getEmployees, createEmployee } from "@/lib/employee-db";
import { employeeSchema } from "@/lib/employees";
export const runtime = "nodejs";
export async function GET() {
  try {
    const c = await context();
    return Response.json((await getEmployees(c.workspace)), {headers: {"Cache-Control": "private, no-store"}});
  } catch (e) { return apiError(e); }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const c = await context();
    const parsed = employeeSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({error: parsed.error.issues[0].message}, {status: 422});
    return Response.json((await createEmployee(c.workspace, parsed.data)), {status: 201});
  } catch (e) { return apiError(e); }
}
