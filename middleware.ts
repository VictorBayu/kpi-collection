import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE } from "./lib/session-const";

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

  /**
   * Halaman ini berisi data pribadi (KPI dan insentif per orang), jadi
   * jangan sampai tersimpan di cache browser atau proxy. Tanpa ini,
   * menekan tombol Kembali setelah keluar masih bisa menampilkan halaman
   * milik akun sebelumnya dari memori browser.
   */
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function redirect(req: NextRequest, to: string) {
  const url = new URL(to, req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/request/:path*", "/tim/:path*", "/admin/:path*"],
};
