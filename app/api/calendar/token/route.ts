import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

/** Create or rotate the secret calendar-subscription URL. Only a SHA-256 hash is stored, so the URL is shown exactly once;
 *  rotating invalidates the old link. Anyone holding the link can read your deadlines/interview dates — treat it like a password. */
export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const token = randomBytes(24).toString("base64url");
  await prisma.user.update({ where: { id: userId }, data: { calendarTokenHash: createHash("sha256").update(token).digest("hex") } });
  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  return NextResponse.json({ url: `${origin.replace(/\/$/, "")}/api/calendar/feed/${token}` });
}
export async function DELETE() {
  const [userId, err] = await apiUser(); if (err) return err;
  await prisma.user.update({ where: { id: userId }, data: { calendarTokenHash: null } });
  return NextResponse.json({ ok: true });
}
