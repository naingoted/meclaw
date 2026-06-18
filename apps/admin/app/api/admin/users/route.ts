import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin/authz";
import { clientIp, db } from "@/lib/admin/request";
import { AdminUserError, createAdminUser, listAdminUsers } from "@/lib/admin/users";

const createSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(12),
  role: z.enum(["super_admin", "admin"]),
});

function errorResponse(error: unknown) {
  if (error instanceof AdminUserError) {
    const status = error.code === "not_found" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  throw error;
}

export async function GET() {
  await requireSuperAdmin();
  return NextResponse.json(await listAdminUsers(await db()));
}

export async function POST(req: Request) {
  const actor = await requireSuperAdmin();
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user payload." }, { status: 400 });
  }
  try {
    const user = await createAdminUser(await db(), parsed.data, actor, clientIp(req));
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
