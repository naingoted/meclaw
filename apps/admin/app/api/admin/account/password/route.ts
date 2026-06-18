import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/authz";
import { clientIp, db } from "@/lib/admin/request";
import { AdminUserError, changeOwnPassword } from "@/lib/admin/users";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(12),
    confirmPassword: z.string().min(12),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function PATCH(req: Request) {
  const actor = await requireAdmin();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid password payload." }, { status: 400 });
  }
  try {
    await changeOwnPassword(await db(), actor, parsed.data, clientIp(req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminUserError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    throw error;
  }
}
