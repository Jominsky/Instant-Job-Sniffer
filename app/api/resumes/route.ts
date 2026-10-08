import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { extractTech } from "@/lib/tech";

const Body = z.object({ label: z.string().trim().min(1).max(60), text: z.string().min(20).max(100_000), isDefault: z.boolean().optional() });

export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return NextResponse.json(await prisma.resume.findMany({ where: { userId }, select: { id: true, label: true, skills: true, isDefault: true, createdAt: true }, orderBy: { createdAt: "desc" } }));
}

// Resumes are stored as extracted text (paste or .txt/.md upload). Skills are derived from the text, never invented.
export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid resume (label and at least a few lines of text required)" }, { status: 400 });
  const first = (await prisma.resume.count({ where: { userId } })) === 0;
  const makeDefault = p.data.isDefault || first;
  if (makeDefault) await prisma.resume.updateMany({ where: { userId }, data: { isDefault: false } });
  const r = await prisma.resume.create({ data: { userId, label: p.data.label, extractedText: p.data.text, skills: extractTech(p.data.text), isDefault: makeDefault } });
  return NextResponse.json({ id: r.id, skills: r.skills });
}
