import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return NextResponse.json(await prisma.companyList.findMany({ where: { OR: [{ userId }, { isBuiltIn: true }] }, include: { _count: { select: { members: true } } }, orderBy: { name: "asc" } }));
}
export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = z.object({ name: z.string().min(1).max(80), description: z.string().max(300).optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  return NextResponse.json(await prisma.companyList.create({ data: { ...p.data, userId } }));
}
