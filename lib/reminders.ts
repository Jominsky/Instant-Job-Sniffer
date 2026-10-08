/** "What needs my attention?": follow-ups, OA deadlines, upcoming interviews, silent applications and referral nudges.
 *  Pure function of the data and the clock. Nothing here contacts anyone. */
export type ReminderKind = "follow_up" | "oa_deadline" | "interview" | "no_response" | "referral";
export type Reminder = { kind: ReminderKind; severity: "overdue" | "soon" | "info"; title: string; detail: string; due: Date | null; href: string };

export type ReminderApp = { jobId: string; title: string; company: string; status: string; dateApplied: Date | null; followUpDate: Date | null; oaDeadline: Date | null; interviewDates: Date[] };
export type ReminderContact = { id: string; name: string; company: string | null; referralRequested: boolean; referralReceived: boolean; lastContactedAt: Date | null; createdAt: Date };

const DAY = 86_400_000;
const CLOSED = new Set(["REJECTED", "WITHDRAWN"]);
const days = (ms: number) => Math.max(0, Math.floor(ms / DAY));
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
export const NO_RESPONSE_DAYS = 14;
export const REFERRAL_NUDGE_DAYS = 7;

export function buildReminders(now: Date, apps: ReminderApp[], contacts: ReminderContact[]): Reminder[] {
  const out: Reminder[] = [];
  const t = now.getTime();
  for (const a of apps) {
    if (CLOSED.has(a.status)) continue;
    const href = `/jobs/${a.jobId}`, who = `${a.company} · ${a.title}`;
    if (a.followUpDate) {
      const dt = a.followUpDate.getTime() - t;
      if (dt <= 0) out.push({ kind: "follow_up", severity: "overdue", title: `Follow up: ${who}`, detail: `Planned for ${dateStr(a.followUpDate)}${days(-dt) ? `, ${days(-dt)} day(s) ago` : ""}`, due: a.followUpDate, href });
      else if (dt <= 3 * DAY) out.push({ kind: "follow_up", severity: "soon", title: `Follow up: ${who}`, detail: `Planned for ${dateStr(a.followUpDate)}`, due: a.followUpDate, href });
    } else if (a.status === "APPLIED" && a.dateApplied && t - a.dateApplied.getTime() >= NO_RESPONSE_DAYS * DAY) {
      out.push({ kind: "no_response", severity: "info", title: `No reply yet: ${who}`, detail: `Applied ${days(t - a.dateApplied.getTime())} days ago. Consider a short follow-up.`, due: null, href });
    }
    if (a.oaDeadline) {
      const dt = a.oaDeadline.getTime() - t;
      if (dt <= 0 && a.status === "OA_RECEIVED") out.push({ kind: "oa_deadline", severity: "overdue", title: `Assessment deadline passed: ${who}`, detail: `Was due ${dateStr(a.oaDeadline)}; status still says OA received`, due: a.oaDeadline, href });
      else if (dt > 0 && dt <= 3 * DAY && a.status !== "OA_COMPLETED") out.push({ kind: "oa_deadline", severity: "soon", title: `Assessment due soon: ${who}`, detail: `Due ${dateStr(a.oaDeadline)}`, due: a.oaDeadline, href });
    }
    for (const d of a.interviewDates) {
      const dt = d.getTime() - t;
      if (dt > 0 && dt <= 7 * DAY) out.push({ kind: "interview", severity: "soon", title: `Interview: ${who}`, detail: `${dateStr(d)} (in ${Math.max(1, Math.ceil(dt / DAY))} day(s))`, due: d, href });
    }
  }
  for (const c of contacts) {
    if (!c.referralRequested || c.referralReceived) continue;
    const last = c.lastContactedAt ?? c.createdAt;
    if (t - last.getTime() >= REFERRAL_NUDGE_DAYS * DAY)
      out.push({ kind: "referral", severity: "info", title: `Referral pending: ${c.name}${c.company ? ` (${c.company})` : ""}`, detail: `You asked ${days(t - last.getTime())} days ago and have not recorded a reply`, due: null, href: "/contacts" });
  }
  const rank = { overdue: 0, soon: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) || a.title.localeCompare(b.title));
}
