import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { hasCriteria } from "@/lib/rules";
import { AlertBody } from "@/lib/schemas";

export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return NextResponse.json(await prisma.alert.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }));
}
export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = AlertBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid alert", issues: p.error.issues }, { status: 400 });
  // An alert with no criteria and no watchlist would fire for every job: refuse (anti-spam).
  if (!hasCriteria(p.data.ruleJson) && !p.data.watchlistId) return NextResponse.json({ error: "Add at least one criterion or pick a watchlist" }, { status: 400 });
  if (p.data.watchlistId && !(await prisma.watchlist.findFirst({ where: { id: p.data.watchlistId, userId } }))) return NextResponse.json({ error: "Unknown watchlist" }, { status: 400 });
  return NextResponse.json(await prisma.alert.create({ data: { userId, ...p.data, watchlistId: p.data.watchlistId ?? null } }));
}
