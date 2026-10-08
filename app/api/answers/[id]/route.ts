import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

const Patch = z.object({
  question: z.string().trim().min(1).max(200).optional(),
  answer: z.string().trim().min(1).max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const r = await prisma.savedAnswer.updateMany({ where: { id: params.id, userId }, data: p.data });   // scoped to the owner
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  await prisma.savedAnswer.deleteMany({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
