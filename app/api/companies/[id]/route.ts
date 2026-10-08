import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { detectAts } from "@/lib/ats";

const Body = z.object({
  name: z.string().min(1).max(120).optional(), careersUrl: z.string().url().max(500).nullable().optional(),
  website: z.string().url().max(500).nullable().optional(), logoUrl: z.string().url().max(500).nullable().optional(),
  category: z.enum(["BIG_TECH","QUANT","HEDGE_FUND","PROP_TRADING","FINTECH","FORTUNE_500","STARTUP","HEALTHCARE","FINANCE","OTHER"]).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(), isActive: z.boolean().optional(),
  industry: z.string().max(100).nullable().optional(), notes: z.string().max(10000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(), atsIdentifier: z.string().max(200).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const [, err] = await apiUser();
  if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const data: Record<string, unknown> = { ...p.data };
  if (p.data.careersUrl) {   // re-detect ATS whenever the careers URL changes
    const a = detectAts(p.data.careersUrl);
    data.atsProvider = a.ats; if (!p.data.atsIdentifier) data.atsIdentifier = a.identifier;
    data.consecutiveFailures = 0;
  }
  return NextResponse.json(await prisma.company.update({ where: { id: params.id }, data }));
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const [, err] = await apiUser();
  if (err) return err;
  await prisma.company.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
