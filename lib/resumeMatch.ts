// Resume recommendation. Pure and deterministic: it only compares technologies the JOB mentions against technologies
// that actually appear in each resume's text. It never invents or suggests adding skills you don't have.
import { extractTech } from "./tech";

export type ResumeLite = { id: string; label: string; isDefault: boolean; text: string };
export type ResumeRecommendation = {
  best: { id: string; label: string } | null; reason: string; jobTechs: string[];
  perResume: { id: string; label: string; covered: string[]; missing: string[]; score: number }[];
};

export function recommendResume(jobTechs: string[], resumes: ResumeLite[]): ResumeRecommendation {
  const techs = Array.from(new Set(jobTechs));
  if (!resumes.length) return { best: null, reason: "Upload a resume on the Resumes page to get a recommendation.", jobTechs: techs, perResume: [] };
  if (!techs.length) return { best: null, reason: "This posting doesn't mention specific technologies, so there is nothing to compare. Use your default resume.", jobTechs: techs, perResume: [] };

  const per = resumes.map((r) => {
    const has = new Set(extractTech(r.text).map((t) => t.toLowerCase()));
    const covered = techs.filter((t) => has.has(t.toLowerCase()));
    return { id: r.id, label: r.label, covered, missing: techs.filter((t) => !has.has(t.toLowerCase())), score: covered.length / techs.length, isDefault: r.isDefault };
  }).sort((a, b) => b.score - a.score || Number(b.isDefault) - Number(a.isDefault) || a.label.localeCompare(b.label));

  const top = per[0];
  const tie = per.filter((p) => p.score === top.score).length > 1;
  const reason = top.covered.length === 0
    ? `None of your resumes mention the technologies this posting lists (${techs.join(", ")}). Send the version that best reflects your real experience; don't add skills you don't have.`
    : `${top.label} covers ${top.covered.length} of ${techs.length} technologies the posting mentions (${top.covered.join(", ")})`
      + (top.missing.length ? `; not found in it: ${top.missing.join(", ")}. Only add these if you genuinely have the experience.` : ".")
      + (tie ? " (Another resume ties; the default was preferred.)" : "");
  return { best: { id: top.id, label: top.label }, reason, jobTechs: techs, perResume: per.map(({ isDefault: _d, ...p }) => p) };
}
