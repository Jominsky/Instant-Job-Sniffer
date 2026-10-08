import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAts, slugify } from "@/lib/ats";
import { parseCompanyText, toCompanyData } from "@/lib/companyImport";
import { extractTech } from "@/lib/tech";
import { funnel, weeklyBuckets, topCounts, avgDelayHours, fmtDelay } from "@/lib/analytics";
import { recommendResume } from "@/lib/resumeMatch";
import { buildIcs } from "@/lib/ics";

test("detectAts mirrors the worker's registry", () => {
  assert.deepEqual(detectAts("https://boards.greenhouse.io/stripe"), { ats: "GREENHOUSE", identifier: "stripe" });
  assert.deepEqual(detectAts("https://job-boards.greenhouse.io/databricks"), { ats: "GREENHOUSE", identifier: "databricks" });
  assert.deepEqual(detectAts("https://jobs.lever.co/palantir"), { ats: "LEVER", identifier: "palantir" });
  assert.deepEqual(detectAts("https://jobs.eu.lever.co/x"), { ats: "LEVER", identifier: "eu:x" });
  assert.deepEqual(detectAts("https://jobs.ashbyhq.com/ramp"), { ats: "ASHBY", identifier: "ramp" });
  assert.deepEqual(detectAts("https://jobs.smartrecruiters.com/Visa"), { ats: "SMARTRECRUITERS", identifier: "Visa" });
  assert.deepEqual(detectAts("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"), { ats: "WORKDAY", identifier: "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite" });
  assert.equal(detectAts("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x").identifier, "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite");
  assert.equal(detectAts("https://careers.icims.com/x").ats, "ICIMS");
  assert.equal(detectAts("https://acme.com/careers").ats, "GENERIC_CAREERS_PAGE");
  assert.equal(detectAts(null).ats, "UNKNOWN");
  assert.equal(slugify("D. E. Shaw"), "d-e-shaw");
});

test("company import: names, urls, CSV", () => {
  assert.deepEqual(parseCompanyText("Jane Street, HRT, SIG").map((r) => r.name), ["Jane Street", "HRT", "SIG"]);
  const rows = parseCompanyText("Stripe https://boards.greenhouse.io/stripe\nJane Street");
  assert.equal(rows[0].name, "Stripe"); assert.equal(rows[0].careersUrl, "https://boards.greenhouse.io/stripe"); assert.equal(rows[1].careersUrl, undefined);
  const csv = parseCompanyText('name,careers_url,category,priority,tags\n"Acme, Inc.",https://jobs.lever.co/acme,quant,p0,a;b');
  assert.equal(csv[0].name, "Acme, Inc."); assert.deepEqual(csv[0].tags, ["a", "b"]);
  const d = toCompanyData(csv[0]);
  assert.equal(d.atsProvider, "LEVER"); assert.equal(d.atsIdentifier, "acme"); assert.equal(d.category, "QUANT"); assert.equal(d.priority, "P0");
  assert.equal(toCompanyData({ name: "X", category: "nonsense", priority: "P9" }).category, "OTHER");
});

test("tech extraction mirrors the worker", () => {
  const t = extractTech("We use C++, Python and Linux. Go is nice. Cross-functional. Rust too.");
  for (const x of ["C++", "Python", "Linux", "Go", "Rust"]) assert.ok(t.includes(x), x);
  assert.ok(!t.includes("C#")); assert.ok(!extractTech("cross-functional rusty gopher").includes("Go"));
});

test("funnel uses 'ever reached' and ignores non-submitted", () => {
  const f = funnel([
    { status: "REJECTED", dateApplied: "2026-10-01", history: ["APPLIED", "OA_RECEIVED", "REJECTED"] },
    { status: "OFFER", dateApplied: "2026-10-01", history: ["APPLIED", "TECHNICAL_INTERVIEW", "OFFER"] },
    { status: "APPLIED", dateApplied: "2026-10-02", history: [] },
    { status: "SAVED", dateApplied: null, history: [] },
  ]);
  assert.equal(f.submitted, 3); assert.equal(f.oa, 1); assert.equal(f.interview, 1); assert.equal(f.offer, 1); assert.equal(f.rejected, 1);
  assert.equal(f.oaRate, 33.3); assert.equal(funnel([]).oaRate, null);
});

test("weekly buckets, top counts, delay", () => {
  const now = new Date("2026-10-07T12:00:00Z"); // Wednesday; week starts Mon 10-05
  const b = weeklyBuckets(["2026-10-05T01:00:00Z", "2026-10-06T00:00:00Z", "2026-09-29T00:00:00Z", "2020-01-01"], 3, now);
  assert.deepEqual(b.map((x) => x.label), ["09-21", "09-28", "10-05"]); assert.deepEqual(b.map((x) => x.count), [0, 1, 2]);
  assert.deepEqual(topCounts(["a", "b", "a", null, "c", "a", "b"], (x) => x, 2), [{ label: "a", count: 3 }, { label: "b", count: 2 }]);
  assert.equal(avgDelayHours([{ discovered: "2026-10-01T00:00:00Z", applied: "2026-10-01T02:00:00Z" }, { discovered: "2026-10-01T00:00:00Z", applied: "2026-10-01T04:00:00Z" },
    { discovered: "2026-10-02T00:00:00Z", applied: "2026-10-01T00:00:00Z" }, { discovered: "2026-10-01T00:00:00Z", applied: null }]), 3);
  assert.equal(avgDelayHours([]), null); assert.equal(fmtDelay(0.5), "30 min"); assert.equal(fmtDelay(72), "3.0 days");
});

test("resume recommendation never invents skills", () => {
  const resumes = [
    { id: "g", label: "General SWE", isDefault: true, text: "Python Java React SQL web apps" },
    { id: "q", label: "Quant SWE", isDefault: false, text: "C++ Linux networking low latency systems, Python" },
  ];
  const r = recommendResume(["C++", "distributed systems", "Linux", "networking"], resumes);
  assert.equal(r.best?.label, "Quant SWE"); assert.match(r.reason, /3 of 4/); assert.match(r.reason, /distributed systems/); assert.match(r.reason, /genuinely have/);
  assert.deepEqual(r.perResume.find((x) => x.id === "q")?.missing, ["distributed systems"]);
  assert.equal(recommendResume([], resumes).best, null); assert.equal(recommendResume(["C++"], []).best, null);
  const none = recommendResume(["Kafka"], resumes); assert.match(none.reason, /don't add skills/);
  assert.equal(recommendResume(["Python"], [{ id: "a", label: "A", isDefault: false, text: "Python" }, { id: "b", label: "B", isDefault: true, text: "Python" }]).best?.label, "B"); // tie -> default
});

test("ics export is well-formed", () => {
  const ics = buildIcs([{ uid: "1", title: "OA due: Acme, Inc.; urgent", date: new Date("2026-10-09T00:00:00Z"), description: "line1\nline2" },
    { uid: "2", title: "x".repeat(200), date: new Date("2026-12-31T00:00:00Z") }], new Date("2026-10-05T10:20:30Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n")); assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /DTSTART;VALUE=DATE:20261009\r\nDTEND;VALUE=DATE:20261010/); assert.match(ics, /DTEND;VALUE=DATE:20270101/);
  assert.match(ics, /SUMMARY:OA due: Acme\\, Inc\.\\; urgent/); assert.match(ics, /DESCRIPTION:line1\\nline2/); assert.match(ics, /DTSTAMP:20261005T102030Z/);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, "line too long: " + line.length);
});

test("detectAts recognises RSS/Atom feed URLs (mirrors worker detect_ats) without stealing real ATS or ordinary pages", () => {
  for (const u of ["https://acme.example/jobs.rss", "https://acme.example/careers/feed", "https://acme.example/careers/feed/", "https://acme.example/jobs.atom?x=1", "https://acme.example/careers.xml", "https://acme.example/jobs?format=rss"])
    assert.deepEqual(detectAts(u), { ats: "RSS_FEED", identifier: u });
  assert.equal(detectAts("https://boards.greenhouse.io/stripe").ats, "GREENHOUSE");
  assert.equal(detectAts("https://acme.example/careers").ats, "GENERIC_CAREERS_PAGE");
  assert.equal(detectAts("https://acme.example/feedback").ats, "GENERIC_CAREERS_PAGE");
  assert.equal(detectAts("https://careers.icims.com/x").ats, "ICIMS");
});
