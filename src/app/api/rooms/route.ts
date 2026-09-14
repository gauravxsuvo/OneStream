import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "Watch Party").slice(0, 80).trim() || "Watch Party";

  let code = generateCode();
  for (let attempts = 0; attempts < 5; attempts++) {
    const existing = await prisma.room.findUnique({ where: { code } });
    if (!existing) break;
    code = generateCode();
  }

  const room = await prisma.room.create({ data: { code, name } });
  return NextResponse.json(room, { status: 201 });
}
