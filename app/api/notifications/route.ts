import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  return NextResponse.json({ items, unread });
}
export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = z.object({ ids: z.array(z.string()).max(100).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  await prisma.notification.updateMany({ where: { userId, read: false, ...(p.data.ids ? { id: { in: p.data.ids } } : {}) }, data: { read: true } });
  return NextResponse.json({ ok: true });
}
