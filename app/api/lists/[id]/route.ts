import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

const Body = z.object({ add: z.array(z.string()).max(2000).optional(), remove: z.array(z.string()).max(2000).optional(), name: z.string().min(1).max(80).optional() });

// Built-in lists are editable too (spec: "keep these editable").
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const [, err] = await apiUser(); if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (p.data.name) await prisma.companyList.update({ where: { id: params.id }, data: { name: p.data.name } });
  if (p.data.add?.length) await prisma.companyListMember.createMany({ data: p.data.add.map((companyId) => ({ companyListId: params.id, companyId })), skipDuplicates: true });
  if (p.data.remove?.length) await prisma.companyListMember.deleteMany({ where: { companyListId: params.id, companyId: { in: p.data.remove } } });
  return NextResponse.json({ ok: true });
}
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const [, err] = await apiUser(); if (err) return err;
  await prisma.companyList.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
