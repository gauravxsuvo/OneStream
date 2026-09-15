import { NextResponse, type NextRequest } from "next/server";
import type { MediaType } from "@prisma/client";
import { VIEWER_COOKIE } from "@/proxy";
import { recordHeartbeat } from "@/lib/usageLimits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const mediaType = body?.mediaType;
  const seconds = Number(body?.seconds);
  if (mediaType !== "VIDEO" && mediaType !== "AUDIO") {
    return NextResponse.json({ error: "mediaType must be VIDEO or AUDIO" }, { status: 400 });
  }
  if (!Number.isFinite(seconds) || seconds < 0) {
    return NextResponse.json({ error: "seconds must be a non-negative number" }, { status: 400 });
  }
  const viewerId = req.cookies.get(VIEWER_COOKIE)?.value ?? "unknown";
  const status = await recordHeartbeat(viewerId, mediaType as MediaType, seconds);
  return NextResponse.json(status);
}
