import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { RuleSchema } from "@/lib/rules";

const Body = z.object({ name: z.string().trim().min(1).max(80), filterJson: RuleSchema });

export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return NextResponse.json(await prisma.watchlist.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }));
}
export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid watchlist", issues: p.error.issues }, { status: 400 });
  return NextResponse.json(await prisma.watchlist.create({ data: { userId, name: p.data.name, filterJson: p.data.filterJson } }));
}
