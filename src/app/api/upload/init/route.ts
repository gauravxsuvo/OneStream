import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isAuthenticated } from "@/lib/authHash";
import { createUploadSession } from "@/lib/uploadSessions";

export const runtime = "nodejs";

// Path-prefix-excluded from proxy.ts's matcher the same way /api/upload
// itself is (see the comment there) -- it's tiny either way, but keeping the
// auth check inline here is what actually gates it.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated(req.cookies.get(AUTH_COOKIE)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const uploadId = createUploadSession();
  return NextResponse.json({ uploadId });
}
