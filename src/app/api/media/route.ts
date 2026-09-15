import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const media = await prisma.media.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      renditions: {
        select: { label: true, status: true, height: true, bitrateKbps: true, size: true },
      },
    },
  });
  return NextResponse.json(media);
}
