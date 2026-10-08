// Mirror of worker/connectors/registry.py detect_ats(): keep the two in sync.
/** ATS providers that have a worker connector (mirror of CONNECTORS in worker/connectors/registry.py). Used by the UI and diagnostics. */
export const SCANNABLE_ATS = ["GREENHOUSE", "LEVER", "ASHBY", "SMARTRECRUITERS", "WORKDAY", "GENERIC_CAREERS_PAGE", "RSS_FEED"] as const;
export type AtsGuess = { ats: string; identifier: string | null };

export function detectAts(url?: string | null): AtsGuess {
  if (!url) return { ats: "UNKNOWN", identifier: null };
  let m = url.match(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([\w-]+)/i);
  if (m) return { ats: "GREENHOUSE", identifier: m[1] };
  m = url.match(/jobs\.(eu\.)?lever\.co\/([\w-]+)/i);
  if (m) return { ats: "LEVER", identifier: (m[1] ? "eu:" : "") + m[2] };
  m = url.match(/jobs\.ashbyhq\.com\/([\w.%-]+)/i);
  if (m) return { ats: "ASHBY", identifier: m[1] };
  m = url.match(/(?:jobs|careers)\.smartrecruiters\.com\/([\w%-]+)/i);
  if (m) return { ats: "SMARTRECRUITERS", identifier: m[1] };
  m = url.trim().match(/^(?:https?:\/\/)?([\w-]+)\.wd\d+\.myworkdayjobs\.com(?:\/[a-z]{2}-[A-Za-z]{2})?\/([\w%-]+)/i);
  if (m) return { ats: "WORKDAY", identifier: `${url.trim().match(/^(?:https?:\/\/)?([^/]+)/i)![1].toLowerCase()}|${m[1].toLowerCase()}|${m[2]}` };
  if (/(?:\.(?:rss|atom|xml)(?:[?#]|$)|\/(?:rss|feed|atom)\/?(?:[?#]|$)|[?&]format=(?:rss|atom))/i.test(url.trim())) return { ats: "RSS_FEED", identifier: url.trim() };
  const l = url.toLowerCase();
  if (l.includes("jobvite.com")) return { ats: "JOBVITE", identifier: null };
  if (l.includes("icims.com")) return { ats: "ICIMS", identifier: null };
  if (l.includes("successfactors")) return { ats: "SUCCESSFACTORS", identifier: null };
  return { ats: "GENERIC_CAREERS_PAGE", identifier: null };
}

export const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
