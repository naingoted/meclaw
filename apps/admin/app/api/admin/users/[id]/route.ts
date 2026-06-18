import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin/authz";
import { clientIp, db } from "@/lib/admin/request";
import { AdminUserError, deleteAdminUser, updateAdminUser } from "@/lib/admin/users";

const patchSchema = z
  .object({
    role: z.enum(["super_admin", "admin"]).optional(),
    password: z.string().min(12).optional(),
  })
  .strict();

function errorResponse(error: unknown) {
  if (error instanceof AdminUserError) {
    const status = error.code === "not_found" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  throw error;
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Params) {
  const actor = await requireSuperAdmin();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user update." }, { status: 400 });
  }
  const { id } = await ctx.params;
  try {
    return NextResponse.json(
      await updateAdminUser(await db(), id, parsed.data, actor, clientIp(req)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, ctx: Params) {
  const actor = await requireSuperAdmin();
  const { id } = await ctx.params;
  try {
    await deleteAdminUser(await db(), id, actor, clientIp(req));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
