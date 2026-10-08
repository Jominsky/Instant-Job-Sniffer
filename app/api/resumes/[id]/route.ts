import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function PATCH(_: Request, { params }: { params: { id: string } }) {   // make default
  const [userId, err] = await apiUser(); if (err) return err;
  const r = await prisma.resume.findFirst({ where: { id: params.id, userId } });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.resume.updateMany({ where: { userId }, data: { isDefault: false } });
  await prisma.resume.update({ where: { id: r.id }, data: { isDefault: true } });
  return NextResponse.json({ ok: true });
}
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  await prisma.resume.deleteMany({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
