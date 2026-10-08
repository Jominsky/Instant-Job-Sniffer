import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AlertBody } from "@/lib/schemas";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = AlertBody.partial().safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid alert" }, { status: 400 });
  const r = await prisma.alert.updateMany({ where: { id: params.id, userId }, data: p.data });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  await prisma.alert.deleteMany({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
