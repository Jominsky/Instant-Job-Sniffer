export function relTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

export function isFresh(d: Date | string, hours = 24) {
  return Date.now() - new Date(d).getTime() < hours * 3600_000;
}

/** Distinguish "newly posted" from "old posting our system only just indexed". */
export function discoveryKind(posted: Date | null, discovered: Date, reposted: boolean, reopenedAt: Date | null): string {
  if (reposted) return "Reposted";
  if (reopenedAt && Date.now() - reopenedAt.getTime() < 3 * 86400_000) return "Reopened";
  if (posted && discovered.getTime() - posted.getTime() > 2 * 86400_000) return "Newly indexed (older posting)";
  return "Newly discovered";
}

export const ROLE_LABELS: Record<string, string> = {
  SWE: "Software Engineering", BACKEND: "Backend", FRONTEND: "Frontend", FULL_STACK: "Full Stack",
  INFRASTRUCTURE: "Infrastructure", DISTRIBUTED_SYSTEMS: "Distributed Systems", ML_AI: "ML / AI",
  DATA_ENGINEERING: "Data Engineering", QUANT_DEVELOPER: "Quant Developer", QUANT_RESEARCH: "Quant Research",
  QUANT_TRADING: "Quant Trading", DEVOPS_SRE: "DevOps / SRE", SECURITY: "Security", PRODUCT: "Product", OTHER: "Other",
};
export const EXP_LABELS: Record<string, string> = {
  INTERNSHIP: "Internship", NEW_GRAD: "New Grad", ENTRY_LEVEL: "Entry Level", EXPERIENCED: "Experienced", UNKNOWN: "Unknown",
};
export const CATEGORY_LABELS: Record<string, string> = {
  BIG_TECH: "Big Tech", QUANT: "Quant", HEDGE_FUND: "Hedge Fund", PROP_TRADING: "Prop Trading", FINTECH: "Fintech",
  FORTUNE_500: "Fortune 500", STARTUP: "Startup", HEALTHCARE: "Healthcare", FINANCE: "Finance", OTHER: "Other",
};
export const APP_STATUSES = ["DISCOVERED", "INTERESTED", "SAVED", "APPLYING", "APPLIED", "OA_RECEIVED", "OA_COMPLETED",
  "RECRUITER_SCREEN", "TECHNICAL_INTERVIEW", "FINAL_ROUND", "OFFER", "REJECTED", "WITHDRAWN"] as const;
export const label = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
