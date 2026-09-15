import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { AUTH_COOKIE, sha256Hex } from "@/lib/authHash";

const PUBLIC_PATHS = ["/enter", "/api/enter"];

// Anonymous per-browser id used only to attribute daily watch-time quotas
// (usageLimits.ts) to "this friend" without real accounts. Not a security
// boundary -- clearing cookies gets a fresh budget, which is an accepted
// gap for a friends-only soft cap, not something worth fighting.
export const VIEWER_COOKIE = "onestream_viewer";

// Next.js 16 renamed the "middleware.ts" file convention to "proxy.ts" (and
// the exported function from `middleware` to `proxy`) — the old file is
// silently never invoked on this version, which meant this passcode gate
// wasn't actually running. See the migration note in Next's own docs:
// https://nextjs.org/docs/app/api-reference/file-conventions/proxy#migration-to-proxy
function withViewerCookie(req: NextRequest, res: NextResponse): NextResponse {
  if (!req.cookies.get(VIEWER_COOKIE)?.value) {
    res.cookies.set(VIEWER_COOKIE, randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const passcode = process.env.ONESTREAM_PASSCODE;
  if (!passcode) return withViewerCookie(req, NextResponse.next());

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return withViewerCookie(req, NextResponse.next());
  }

  const expected = await sha256Hex(passcode);
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie === expected) return withViewerCookie(req, NextResponse.next());

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
