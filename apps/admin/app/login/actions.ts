"use server";
import { signIn } from "@/auth";

export async function loginAction(formData: FormData) {
  await signIn("credentials", {
    username: formData.get("username"),
    password: formData.get("password"),
    redirectTo: "/admin",
  });
}
