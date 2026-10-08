import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { ProfileForm, type ProfileData } from "@/components/ProfileForm";
import { CalendarLink } from "@/components/CalendarLink";

const DEFAULT_RULES = ["senior", "staff", "principal", "manager", "phd-only", "hardware-only", "years:5"];

export default async function Settings() {
  const userId = await requireUserId();
  const [p, u] = await Promise.all([prisma.profile.findUnique({ where: { userId } }), prisma.user.findUnique({ where: { id: userId }, select: { calendarTokenHash: true } })]);
  const initial: ProfileData = {
    skills: p?.skills ?? [], languages: p?.languages ?? [], technologies: p?.technologies ?? [], majors: p?.majors ?? [],
    preferredRoles: p?.preferredRoles ?? ["SWE"], preferredLocations: p?.preferredLocations ?? [], preferredCompanies: p?.preferredCompanies ?? [],
    preferredIndustries: p?.preferredIndustries ?? [], keywords: p?.keywords ?? [], excludedKeywords: p?.excludedKeywords ?? [],
    graduationYear: p?.graduationYear ?? null, targetSeason: p?.targetSeason ?? "Summer", targetYear: p?.targetYear ?? 2027,
    sponsorshipRequired: p?.sponsorshipRequired ?? false, minCompensation: p?.minCompensation ?? null,
    exclusionRules: p?.exclusionRules?.length ? p.exclusionRules : DEFAULT_RULES,
    weights: { role: p?.weightRoleRelevance ?? 30, experience: p?.weightExperienceElig ?? 20, skills: p?.weightSkillsMatch ?? 20,
      company: p?.weightCompanyPref ?? 10, location: p?.weightLocationPref ?? 10, resume: p?.weightResumeSimilarity ?? 10 },
  };
  return <div className="page"><div><h1 className="h1">Profile & matching</h1><p className="text-sm muted">Drives the 0–100 fit score and exclusion rules.</p></div><ProfileForm initial={initial} /><CalendarLink hasLink={!!u?.calendarTokenHash} /></div>;
}
