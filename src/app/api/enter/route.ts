import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, sha256Hex } from "@/lib/authHash";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const passcode = String(body.passcode ?? "");
  const expected = process.env.ONESTREAM_PASSCODE;

  if (!expected) {
    return NextResponse.json({ ok: true });
  }

  const [a, b] = await Promise.all([sha256Hex(passcode), sha256Hex(expected)]);
  if (a !== b) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, b, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 60,
    path: "/",
  });
  return res;
}
