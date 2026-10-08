import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

const MAX_PER_USER = 50;
const Body = z.object({
  name: z.string().trim().min(1).max(80),
  query: z.string().trim().max(200).optional(),
  // Exactly what the Jobs page URL carries (strings only); "page" is never saved.
  filters: z.record(z.string().max(200)).refine((o) => Object.keys(o).length <= 30, "too many filters").default({}),
});

export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return NextResponse.json(await prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }));
}

export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid search", issues: p.error.issues }, { status: 400 });
  if ((await prisma.savedSearch.count({ where: { userId } })) >= MAX_PER_USER)
    return NextResponse.json({ error: `You can keep up to ${MAX_PER_USER} saved searches.` }, { status: 409 });
  const { page: _page, ...filters } = p.data.filters;
  return NextResponse.json(await prisma.savedSearch.create({ data: { userId, name: p.data.name, query: p.data.query || null, filterJson: filters } }));
}
