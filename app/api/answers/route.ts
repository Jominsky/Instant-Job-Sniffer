import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

const AnswerBody = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return NextResponse.json(await prisma.savedAnswer.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }));
}

export async function POST(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = AnswerBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Question (1-200 chars) and answer (1-5000 chars) are required." }, { status: 400 });
  if ((await prisma.savedAnswer.count({ where: { userId } })) >= 200) return NextResponse.json({ error: "Limit of 200 saved answers reached." }, { status: 400 });
  return NextResponse.json(await prisma.savedAnswer.create({ data: { ...p.data, userId } }), { status: 201 });
}
