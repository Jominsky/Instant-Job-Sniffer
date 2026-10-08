import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/session";
import { prisma } from "@/lib/db";

const list = z.array(z.string().trim().min(1).max(80)).max(100);
const Body = z.object({
  skills: list, languages: list, technologies: list, majors: list, preferredRoles: list, preferredLocations: list,
  preferredCompanies: list, preferredIndustries: list, keywords: list, excludedKeywords: list,
  graduationYear: z.number().int().min(2020).max(2040).nullable(), targetSeason: z.enum(["Summer", "Fall", "Winter", "Spring"]),
  targetYear: z.number().int().min(2020).max(2040), sponsorshipRequired: z.boolean(), minCompensation: z.number().int().min(0).max(10_000_000).nullable(),
  weights: z.object({ role: z.number().int().min(0).max(100), experience: z.number().int().min(0).max(100), skills: z.number().int().min(0).max(100),
    company: z.number().int().min(0).max(100), location: z.number().int().min(0).max(100), resume: z.number().int().min(0).max(100) })
    .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) > 0, "weights must not all be zero"),
  exclusionRules: z.array(z.string().regex(/^(senior|staff|principal|manager|lead|director|phd-only|hardware-only|years:\d{1,2}|kw:.{1,40})$/)).max(40),
});

export async function GET() {
  const [userId, err] = await apiUser(); if (err) return err;
  return NextResponse.json(await prisma.profile.findUnique({ where: { userId } }));
}

export async function PUT(req: Request) {
  const [userId, err] = await apiUser(); if (err) return err;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid profile", issues: p.error.issues }, { status: 400 });
  const { weights: w, ...rest } = p.data;
  const data = { ...rest, weightRoleRelevance: w.role, weightExperienceElig: w.experience, weightSkillsMatch: w.skills, weightCompanyPref: w.company,
    weightLocationPref: w.location, weightResumeSimilarity: w.resume };
  return NextResponse.json(await prisma.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data }));
}
