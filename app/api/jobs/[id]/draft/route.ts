import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { limiters } from "@/lib/limits";
import { prisma } from "@/lib/db";
import { getLlm } from "@/lib/llm";
import { buildDraftPrompt, cleanDraft, DRAFT_KINDS } from "@/lib/drafts";

const Body = z.object({ kind: z.enum(DRAFT_KINDS), question: z.string().max(1000).optional(), notes: z.string().max(1000).optional(), resumeId: z.string().max(40).optional() });

/** Generates a DRAFT only. It is never saved or submitted anywhere; the user reviews, edits and applies on the employer's site. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const [userId, err] = await apiUser(limiters.draft); if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const llm = getLlm();
  if (!llm) return NextResponse.json({ error: "No AI provider configured. Set AI_PROVIDER (anthropic | openai) and the matching API key in .env, then restart." }, { status: 501 });
  const job = await prisma.job.findUnique({ where: { id: params.id }, include: { company: { select: { name: true } } } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const resume = p.data.resumeId
    ? await prisma.resume.findFirst({ where: { id: p.data.resumeId, userId } })
    : await prisma.resume.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  const { system, user } = buildDraftPrompt({ kind: p.data.kind, jobTitle: job.title, company: job.company.name, location: job.location, description: job.description,
    technologies: job.technologies, resumeLabel: resume?.label, resumeText: resume?.extractedText, question: p.data.question, notes: p.data.notes });
  try {
    const draft = cleanDraft(await llm.complete(system, user));
    if (!draft) return NextResponse.json({ error: "The provider returned an empty draft" }, { status: 502 });
    return NextResponse.json({ draft, provider: llm.name, usedResume: resume?.label ?? null });
  } catch (e) {
    console.error("draft generation failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The AI provider request failed. Check the key/model and try again." }, { status: 502 });
  }
}
