import { test } from "node:test";
import assert from "node:assert/strict";
import { payGroups, periodOf, median, fmtPay, fmtRange } from "@/lib/pay";
import { buildReminders } from "@/lib/reminders";
import { toCsv, csvCell } from "@/lib/csv";
import { summarizeCompany, monthlyCounts } from "@/lib/companyTrends";
import { interviewPrep } from "@/lib/interviewPrep";

const D = (s: string) => new Date(s + "T12:00:00Z");

test("pay: compares like with like, never mixes units, ignores unparsed pay", () => {
  const g = payGroups([
    { key: "Acme", period: "HOUR", min: 50, max: 60 }, { key: "Acme", period: "HOUR", min: 40, max: 50 }, { key: "Beta", period: "HOUR", min: 70, max: 70 },
    { key: "Acme", period: "MONTH", min: 11500, max: 11500 }, { key: "Acme", period: "YEAR", min: 120000, max: 140000 },
    { key: "Ghost", period: null, min: null, max: null }, { key: "Old", period: null, min: 100000, max: 120000 },   // legacy annual row
  ]);
  assert.deepEqual(g.map((x) => [x.key, x.period, x.n, x.median]), [["Beta", "HOUR", 1, 70], ["Acme", "HOUR", 2, 50], ["Acme", "MONTH", 1, 11500], ["Acme", "YEAR", 1, 130000], ["Old", "YEAR", 1, 110000]]);   // within a unit: highest median first
  const acmeHour = g.find((x) => x.key === "Acme" && x.period === "HOUR")!;
  assert.deepEqual([acmeHour.low, acmeHour.high], [40, 60]);
  assert.equal(g.some((x) => x.key === "Ghost"), false);
  assert.equal(periodOf({ period: null, min: 1, max: 2 }), "YEAR"); assert.equal(periodOf({ period: null, min: null, max: null }), null); assert.equal(periodOf({ period: "BOGUS", min: 5, max: 5 }), null);
  assert.equal(median([]), null); assert.equal(median([1, 2, 3, 4]), 3 /* rounds 2.5 */); assert.equal(median([5]), 5);
});
test("pay: formatting", () => {
  assert.equal(fmtPay(55, "HOUR"), "$55/hr"); assert.equal(fmtPay(52.5, "HOUR"), "$52.5/hr"); assert.equal(fmtPay(11500, "MONTH"), "$11,500/mo");
  assert.equal(fmtPay(120000, "YEAR"), "$120k/yr"); assert.equal(fmtPay(127500, "YEAR"), "$127.5k/yr");
  assert.equal(fmtRange(45, 55, "HOUR"), "$45 – $55/hr"); assert.equal(fmtRange(11500, 11500, "MONTH"), "$11,500/mo");
});

test("reminders: overdue first, closed applications silent, no-reply and referral nudges", () => {
  const now = D("2026-10-20");
  const app = (o: object) => ({ jobId: "j", title: "SWE Intern", company: "Acme", status: "APPLIED", dateApplied: D("2026-10-18"), followUpDate: null, oaDeadline: null, interviewDates: [] as Date[], ...o });
  const r = buildReminders(now, [
    app({ jobId: "a", followUpDate: D("2026-10-18") }),                                   // overdue
    app({ jobId: "b", followUpDate: D("2026-10-22") }),                                   // soon
    app({ jobId: "c", followUpDate: D("2026-11-30") }),                                   // far: silent
    app({ jobId: "d", status: "OA_RECEIVED", oaDeadline: D("2026-10-21") }),              // OA soon
    app({ jobId: "e", status: "OA_RECEIVED", oaDeadline: D("2026-10-10") }),              // OA overdue
    app({ jobId: "f", status: "OA_COMPLETED", oaDeadline: D("2026-10-21") }),             // already completed: silent
    app({ jobId: "g", status: "TECHNICAL_INTERVIEW", interviewDates: [D("2026-10-24"), D("2026-09-01")] }),
    app({ jobId: "h", dateApplied: D("2026-09-30") }),                                    // 20 days of silence
    app({ jobId: "i", status: "REJECTED", followUpDate: D("2026-10-01") }),               // closed: silent
  ], [
    { id: "1", name: "Maya", company: "Acme", referralRequested: true, referralReceived: false, lastContactedAt: D("2026-10-01"), createdAt: D("2026-09-01") },
    { id: "2", name: "Dev", company: null, referralRequested: true, referralReceived: true, lastContactedAt: null, createdAt: D("2026-01-01") },
    { id: "3", name: "Sam", company: "Beta", referralRequested: true, referralReceived: false, lastContactedAt: D("2026-10-18"), createdAt: D("2026-10-01") },
  ]);
  assert.deepEqual(r.map((x) => `${x.severity}:${x.kind}:${x.href}`), [
    "overdue:oa_deadline:/jobs/e", "overdue:follow_up:/jobs/a", "soon:oa_deadline:/jobs/d", "soon:follow_up:/jobs/b", "soon:interview:/jobs/g", "info:no_response:/jobs/h", "info:referral:/contacts"]);
  assert.match(r.at(-1)!.title, /Maya/); assert.equal(r.some((x) => x.href === "/jobs/i" || x.href === "/jobs/c" || x.href === "/jobs/f"), false);
  assert.deepEqual(buildReminders(now, [], []), []);
});

test("csv: quoting and formula-injection protection", () => {
  assert.equal(csvCell("plain"), "plain"); assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"'); assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell("+1 555"), "'+1 555"); assert.equal(csvCell("-2+3"), "'-2+3"); assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell(-5), "-5"); assert.equal(csvCell(true), "true"); assert.equal(csvCell(null), ""); assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(new Date("2026-10-08T12:00:00Z")), "2026-10-08T12:00:00.000Z");
  assert.equal(toCsv(["a", "b"], [["x", 1], ["y,z", null]]), "a,b\r\nx,1\r\n\"y,z\",\r\n");
  assert.ok(toCsv(["a"], [], { bom: true }).startsWith("﻿"));
});

test("company trends: monthly buckets and when each internship season first appeared", () => {
  const now = D("2026-10-08");
  const j = (o: object) => ({ firstDiscoveredAt: D("2026-10-01"), datePosted: null, status: "OPEN", roleCategory: "SWE", experienceLevel: "INTERNSHIP", targetSeason: null, targetYear: null, ...o });
  const s = summarizeCompany([
    j({ firstDiscoveredAt: D("2026-08-20"), targetSeason: "Summer", targetYear: 2027, datePosted: D("2026-08-15") }),
    j({ firstDiscoveredAt: D("2026-09-05"), targetSeason: "Summer", targetYear: 2027 }),
    j({ firstDiscoveredAt: D("2025-09-10"), status: "CLOSED", targetSeason: "Summer", targetYear: 2026, roleCategory: "QUANT_DEVELOPER" }),
    j({ experienceLevel: "EXPERIENCED", roleCategory: "SWE" }),
  ], now);
  assert.deepEqual([s.total, s.open, s.openEntryLevel, s.last30Days], [4, 3, 2, 1]);   // only the Oct 1 job is within 30 days of Oct 8
  assert.deepEqual(s.byRole, [["SWE", 3], ["QUANT_DEVELOPER", 1]]);
  assert.deepEqual(s.seasons.map((x) => [x.season, x.firstSeen.toISOString().slice(0, 10), x.postings]), [["Summer 2026", "2025-09-10", 1], ["Summer 2027", "2026-08-15", 2]]);   // posted date beats discovery date
  assert.equal(s.monthly.length, 12); assert.equal(s.monthly.at(-1)!.month, "2026-10"); assert.equal(s.monthly.at(-1)!.count, 1);
  assert.deepEqual(monthlyCounts([D("2026-10-02"), D("2026-10-30"), D("2020-01-01")], 2, now), [{ month: "2026-09", count: 0 }, { month: "2026-10", count: 2 }]);
});

test("interview prep: stage-aware, role- and tech-aware, nothing for closed applications", () => {
  assert.deepEqual(interviewPrep({ status: "REJECTED", role: "SWE", technologies: ["C++"] }), []);
  const pre = interviewPrep({ status: "SAVED", role: "SWE", technologies: ["C++"] });
  assert.deepEqual(pre.map((x) => x.title), ["Before you apply"]);
  const tech = interviewPrep({ status: "TECHNICAL_INTERVIEW", role: "QUANT_TRADING", technologies: ["C++", "Python", "Haskell"] });
  assert.deepEqual(tech.map((x) => x.title), ["Technical interview", "Topics to review for this role", "Technologies in the posting"]);
  assert.ok(tech[1].items.some((i) => /expected value/i.test(i))); assert.equal(tech[2].items.length, 2);   // Haskell has no canned topic: omitted, not invented
  assert.deepEqual(interviewPrep({ status: "OA_RECEIVED", role: "UNKNOWN_ROLE", technologies: [] }).map((x) => x.title), ["Online assessment", "Topics to review for this role"]);
  assert.deepEqual(interviewPrep({ status: "OFFER", role: "SWE", technologies: ["C++"] }).map((x) => x.title), ["Offer"]);
  assert.equal(interviewPrep({ status: "RECRUITER_SCREEN", role: "SWE", technologies: [] }).length, 1);
});
