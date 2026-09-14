import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, sha256Hex } from "@/lib/authHash";

const PUBLIC_PATHS = ["/enter", "/api/enter"];

export async function middleware(req: NextRequest) {
  const passcode = process.env.ONESTREAM_PASSCODE;
  if (!passcode) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const expected = await sha256Hex(passcode);
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/enter";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|socket.io).*)"],
};
