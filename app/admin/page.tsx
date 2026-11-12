import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { ADMIN_ROLES } from "@/types";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-cookie";

export default async function AdminIndexPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
  let shouldRedirectToWorkbench = false;

  if (token && process.env.AUTH_SECRET) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
      const { payload } = await jwtVerify(token, secret, {
        clockTolerance: 60,
        issuer: "nihplod-bavp",
        audience: "nihplod-bavp",
      });

      const role = payload.role as string;
      const isBanned = payload.is_banned === true;

      if (
        !isBanned &&
        ADMIN_ROLES.includes(role as typeof ADMIN_ROLES[number])
      ) {
        shouldRedirectToWorkbench = true;
      }
    } catch {
      // Token 无效或过期，继续跳转到登录页
    }
  }

  // redirect() 会抛出 NEXT_REDIRECT，必须放在 try/catch 之外
  if (shouldRedirectToWorkbench) {
    redirect("/workbench");
  }

  redirect("/admin/login");
}
