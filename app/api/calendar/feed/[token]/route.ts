import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { limiters } from "@/lib/limits";
import { calendarFor, icsHeaders } from "@/lib/calendarEvents";

// Public by design (calendar apps can't send cookies); protected by an unguessable token, hashed at rest and rate-limited.
export async function GET(_: Request, { params }: { params: { token: string } }) {
  const hash = createHash("sha256").update(params.token).digest("hex");
  if (!limiters.feed.check(hash.slice(0, 16)).ok) return new NextResponse("Too many requests", { status: 429 });
  const user = await prisma.user.findUnique({ where: { calendarTokenHash: hash }, select: { id: true } });
  if (!user) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(await calendarFor(user.id), { headers: icsHeaders(true) });
}
