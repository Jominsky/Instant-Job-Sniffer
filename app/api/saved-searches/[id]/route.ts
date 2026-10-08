import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(); if (err) return err;
  await prisma.savedSearch.deleteMany({ where: { id: params.id, userId } });   // scoped to the owner
  return NextResponse.json({ ok: true });
}
