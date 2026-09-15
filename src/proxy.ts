import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, sha256Hex } from "@/lib/authHash";

const PUBLIC_PATHS = ["/enter", "/api/enter"];

// Next.js 16 renamed the "middleware.ts" file convention to "proxy.ts" (and
// the exported function from `middleware` to `proxy`) — the old file is
// silently never invoked on this version, which meant this passcode gate
// wasn't actually running. See the migration note in Next's own docs:
// https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy
export async function proxy(req: NextRequest) {
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
  // /api/upload is excluded on purpose, not because it's public. Next's proxy
  // layer clones and buffers the whole request body in memory for any route
  // it runs on (even though this proxy only ever reads a cookie), capped at
  // 10MB by default. That silently truncated large uploads before they
  // reached busboy ("Unexpected end of form"). /api/upload does its own
  // passcode check instead (see isAuthenticated in src/lib/authHash.ts) so it
  // never passes through that buffering.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|socket.io|api/upload).*)"],
};
