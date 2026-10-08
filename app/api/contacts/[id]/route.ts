import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ContactBody } from "@/lib/schemas";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = ContactBody.partial().safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid contact" }, { status: 400 });
  const { lastContactedAt, linkedinUrl, email, ...rest } = p.data;
  const r = await prisma.contact.updateMany({ where: { id: params.id, userId }, data: { ...rest,
    ...(linkedinUrl !== undefined ? { linkedinUrl: linkedinUrl || null } : {}), ...(email !== undefined ? { email: email || null } : {}),
    ...(lastContactedAt !== undefined ? { lastContactedAt: lastContactedAt ? new Date(lastContactedAt) : null } : {}) } });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  await prisma.contact.deleteMany({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
