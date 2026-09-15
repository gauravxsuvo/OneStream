import { NextResponse, type NextRequest } from "next/server";
import type { MediaType } from "@prisma/client";
import { VIEWER_COOKIE } from "@/proxy";
import { getQuotaStatus } from "@/lib/usageLimits";

export const runtime = "nodejs";

// Auth is already enforced by proxy.ts for this path (it isn't excluded from
// the matcher the way /api/upload/* is), so there's no second passcode check
// here -- see the comment on that matcher.
export async function GET(req: NextRequest) {
  const mediaType = req.nextUrl.searchParams.get("mediaType");
  if (mediaType !== "VIDEO" && mediaType !== "AUDIO") {
    return NextResponse.json({ error: "mediaType must be VIDEO or AUDIO" }, { status: 400 });
  }
  const viewerId = req.cookies.get(VIEWER_COOKIE)?.value ?? "unknown";
  const status = await getQuotaStatus(viewerId, mediaType as MediaType);
  return NextResponse.json(status);
}
