import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { RuleSchema } from "@/lib/rules";

const Body = z.object({ name: z.string().trim().min(1).max(80).optional(), filterJson: RuleSchema.optional() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const r = await prisma.watchlist.updateMany({ where: { id: params.id, userId }, data: p.data });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  await prisma.watchlist.deleteMany({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
