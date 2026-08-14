import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE } from "./lib/auth";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  const url = req.nextUrl;

  if (!token) return redirect(req, "/login");

  let peran = "";
  try {
    const { payload } = await jwtVerify(token, secret());
    peran = String(payload.peran ?? "");
  } catch {
    return redirect(req, "/login");
  }

  if (url.pathname.startsWith("/admin") && peran !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

function redirect(req: NextRequest, to: string) {
  const url = new URL(to, req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/request/:path*", "/tim/:path*", "/admin/:path*"],
};
