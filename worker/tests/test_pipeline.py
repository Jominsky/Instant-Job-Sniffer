import os, sys, unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import CompanyRef, RawJob
from pipeline.text import html_to_text
from pipeline import classify as C
from pipeline.dedupe import normalize_title, canonical_url, find_duplicate, similarity, posting_hash
from pipeline.normalize import normalize, infer_season, parse_pay, infer_work_mode, extract_technologies
from pipeline.score import Profile, score_job, check_exclusions
from pipeline.ingest import plan_ingest
from pipeline.diff import diff_snapshots
from connectors.greenhouse import GreenhouseConnector
from connectors.lever import LeverConnector
from connectors.ashby import AshbyConnector
from connectors.generic import GenericCareersConnector
from connectors.registry import detect_ats

CO = CompanyRef(id="c1", name="Acme Quant", slug="acme-quant", ats="GREENHOUSE", ats_identifier="acme", careers_url=None, priority="P0")
NOW = datetime(2026, 10, 5, tzinfo=timezone.utc)
DESC = ("<p>Join us as a Software Engineering Intern in Summer 2027.</p><h3>Qualifications</h3><ul><li>Python or C++</li>"
        "<li>Strong data structures</li></ul><h3>Preferred Qualifications</h3><ul><li>Linux, networking</li></ul>"
        "<p>Pay: $55 - $60 per hour. Work alongside senior engineers.</p>")


def mk(ext="1", title="Software Engineering Intern - Summer 2027", loc="New York, NY", desc=DESC, url=None, src="greenhouse", ats="GREENHOUSE"):
    raw = RawJob(external_id=ext, title=title, url=url or f"https://boards.greenhouse.io/acme/jobs/{ext}", source_url="", description_html=desc, location=loc)
    return normalize(raw, CO, ats, src)


class TextTests(unittest.TestCase):
    def test_strips_scripts_and_unescapes(self):
        out = html_to_text("&lt;p&gt;Hello&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;")
        self.assertIn("Hello", out); self.assertNotIn("alert", out); self.assertNotIn("<", out)

    def test_plain_html_script_removed(self):
        self.assertEqual(html_to_text("<div>Hi<script>evil()</script><b>there</b></div>"), "Hithere")


class ClassifyTests(unittest.TestCase):
    def test_experience(self):
        self.assertEqual(C.classify_experience("Software Engineer Intern, Summer 2027", ""), "INTERNSHIP")
        self.assertEqual(C.classify_experience("Software Engineer, New Grad 2027", ""), "NEW_GRAD")
        self.assertEqual(C.classify_experience("Senior Software Engineer", ""), "EXPERIENCED")
        self.assertEqual(C.classify_experience("Software Engineer", "Requires 5+ years of experience"), "EXPERIENCED")

    def test_roles(self):
        self.assertEqual(C.classify_role("Quantitative Researcher Intern"), "QUANT_RESEARCH")
        self.assertEqual(C.classify_role("Quantitative Trader Intern"), "QUANT_TRADING")
        self.assertEqual(C.classify_role("Quantitative Developer Intern"), "QUANT_DEVELOPER")
        self.assertEqual(C.classify_role("Machine Learning Engineer Intern"), "ML_AI")
        self.assertEqual(C.classify_role("Backend Engineer Intern"), "BACKEND")
        self.assertEqual(C.classify_role("Software Engineer Intern"), "SWE")
        self.assertEqual(C.classify_role("Office Manager"), "OTHER")

    def test_llm_only_fills_gaps_and_marks_inference(self):
        class LLM:
            def classify(self, t, d): return {"experience": "INTERNSHIP", "role": "SWE"}
        exp, role, prov = C.classify("Technology Program", "student program", LLM())
        self.assertEqual(prov, "AI_INFERENCE")
        exp2, role2, prov2 = C.classify("Software Engineer Intern", "", LLM())
        self.assertEqual(prov2, "ATS")


class NormalizeTests(unittest.TestCase):
    def test_season_explicit_vs_inferred(self):
        s, y, prov, ev = infer_season("SWE Intern", "Summer 2027 internship")
        self.assertEqual((s, y, prov), ("Summer", 2027, "ATS"))
        s, y, prov, ev = infer_season("SWE Intern", "May - August 2027 program")
        self.assertEqual((s, y, prov), ("Summer", 2027, "AI_INFERENCE"))
        self.assertEqual(infer_season("SWE Intern", "no dates")[:2], (None, None))

    def test_pay_annual_hourly_monthly(self):
        a = parse_pay(None, "Salary $120,000 - $150,000 per year")
        self.assertEqual((a.min, a.max, a.period, a.annual_max), (120000, 150000, "YEAR", 150000))
        h = parse_pay(None, "Pay: $55 - $60 per hour")
        self.assertEqual((h.min, h.max, h.period, h.annual_max), (55, 60, "HOUR", 124800)); self.assertIn("$55", h.raw)
        m = parse_pay("$11,500 / month", "")
        self.assertEqual((m.min, m.max, m.period, m.annual_max), (11500, 11500, "MONTH", 138000))
        k = parse_pay(None, "Base: $120k - $150k a year")
        self.assertEqual((k.min, k.max, k.period), (120000, 150000, "YEAR"))
        self.assertEqual(parse_pay("USD 100,000 - 150,000 per-year-salary", "").period, "YEAR")      # Lever-style text
        self.assertEqual(parse_pay("$45 - $60 per-hour-wage", "").period, "HOUR")
        self.assertEqual(parse_pay("$48/hour", "").max, 48)                                          # a single figure with a unit

    def test_pay_never_guesses(self):
        for text in ["We raised $5 million last year", "Earn up to $20 in bonus", "Join our 2027 class", ""]:
            p = parse_pay(None, text); self.assertEqual((p.min, p.max, p.period), (None, None, None), text)
        u = parse_pay("competitive $90 - $100", "")                  # no unit and too small to be annual: raw kept, nothing invented
        self.assertEqual((u.min, u.period), (None, None)); self.assertIn("$90", u.raw)
        e = parse_pay("EUR 60,000 - 80,000 per year", "")            # other currencies cannot be compared with USD
        self.assertEqual((e.min, e.period), (None, None)); self.assertIn("EUR", e.raw)
        self.assertEqual(parse_pay("$2 - $3 per hour", "").period, None)       # outside sane hourly bounds
        self.assertEqual(parse_pay("$100000 - $120000", "").period, "YEAR")    # unmistakably annual with no unit

    def test_work_mode_never_guesses(self):
        self.assertEqual(infer_work_mode(None, "New York, NY", "great job"), "UNKNOWN")
        self.assertEqual(infer_work_mode("remote", None, ""), "REMOTE")

    def test_tech_extraction(self):
        t = extract_technologies("We use C++, Python and Linux. Go is nice. Cross-functional.")
        self.assertIn("C++", t); self.assertIn("Python", t); self.assertIn("Linux", t); self.assertIn("Go", t)
        self.assertNotIn("C#", t)

    def test_full_normalize(self):
        j = mk()
        self.assertEqual((j.experience_level, j.role_category), ("INTERNSHIP", "SWE"))
        self.assertEqual((j.target_season, j.target_year, j.season_provenance), ("Summer", 2027, "ATS"))
        self.assertIsNotNone(j.qualifications); self.assertIn("Linux", j.preferred_qualifications)


class DedupeTests(unittest.TestCase):
    def test_title_normalization(self):
        self.assertEqual(normalize_title("Software Engineering Intern (Summer 2027)"),
                         normalize_title("Software Engineer Internship - Summer 2027"))
        self.assertEqual(normalize_title("Quantitative Developer Intern"), normalize_title("Quant Developer Internship"))

    def test_canonical_url_strips_tracking(self):
        self.assertEqual(canonical_url("https://Jobs.Lever.co/acme/123/?lever-source=x&utm_source=y#apply"),
                         "https://jobs.lever.co/acme/123")

    def test_similarity(self):
        a = "word " * 5 + "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda"
        self.assertGreater(similarity(a, a), 0.99)
        self.assertLess(similarity(a, "totally different content about something else entirely here now"), 0.1)

    def row(self, j, rid="r1", status="OPEN"):
        return {"id": rid, "ats": j.ats, "externalJobId": j.external_id, "dedupeKey": j.dedupe_key,
                "applicationUrl": j.application_url, "normalizedTitle": j.normalized_title,
                "location": j.location, "description": j.description, "status": status,
                "postingHash": j.posting_hash, "version": 1, "source": j.source, "missedScans": 0}

    def test_match_priority(self):
        a = mk("1")
        r = self.row(a)
        self.assertEqual(find_duplicate(mk("1"), [r])[1], "external_id")
        b = mk("2", url=a.application_url + "?utm_source=x")
        self.assertEqual(find_duplicate(b, [r])[1], "application_url")
        c = mk("3", title="Software Engineering Internship (Summer 2027)")
        self.assertEqual(find_duplicate(c, [r])[1], "dedupe_key")

    def test_different_city_is_distinct(self):
        a = mk("1", loc="New York, NY")
        b = mk("2", loc="Chicago, IL", title="SWE Intern 2027")
        self.assertIsNone(find_duplicate(b, [self.row(a)])[0])

    def test_cross_source_description_similarity(self):
        a = mk("1", desc="<p>" + "We build trading systems with low latency c++ and python. " * 12 + "</p>", loc=None)
        b = mk("x9", title="Software Engineer Intern", desc="<p>" + "We build trading systems with low latency c++ and python. " * 12 + "</p>",
               loc=None, url="https://acme.com/careers/x9", src="generic", ats="GENERIC_CAREERS_PAGE")
        row, reason = find_duplicate(b, [self.row(a)])
        self.assertIsNotNone(row)


class ScoreTests(unittest.TestCase):
    def profile(self, **kw):
        base = dict(skills=["Python", "C++"], preferred_roles=["SWE", "QUANT_DEVELOPER"], preferred_locations=["New York"],
                    preferred_companies=["acme quant"], target_year=2027, target_season="Summer")
        base.update(kw)
        return Profile(**base)

    def test_minimum_pay_check_uses_annualised_pay(self):
        from pipeline.score import concerns_for
        prof = self.profile(min_compensation=100000)
        hourly = mk(); hourly.compensation_annual_max = 124800     # $60/hour: fine
        low = mk(); low.compensation_annual_max = 80000
        none = mk()                                                # no parsed pay: never flagged
        self.assertNotIn("Compensation below your minimum", concerns_for(hourly, prof))
        self.assertIn("Compensation below your minimum", concerns_for(low, prof))
        self.assertNotIn("Compensation below your minimum", concerns_for(none, prof))

    def test_strong_match_scores_high_with_reasons(self):
        r = score_job(mk(), "P0", "Acme Quant", self.profile())
        self.assertGreaterEqual(r.score, 85)
        joined = " ".join(r.reasons)
        self.assertIn("Python listed", joined); self.assertIn("Preferred company", joined)

    def test_borderline_is_lowered_not_rejected(self):
        j = mk(title="Software Engineering Intern - Summer 2026", desc="<p>Summer 2026 internship</p><p>Python</p>")
        r = score_job(j, "P2", "Other", self.profile())
        self.assertTrue(any("Wrong season" in c for c in r.concerns))
        self.assertGreater(r.score, 0)

    def test_experienced_flagged(self):
        j = mk(title="Senior Software Engineer", desc="<p>Requires 5+ years of experience and security clearance.</p>")
        r = score_job(j, "P2", "Other", self.profile())
        self.assertIn("Not an internship / new grad role", r.concerns)
        self.assertTrue(any("5+ years" in c for c in r.concerns)); self.assertIn("Requires security clearance", r.concerns)
        self.assertLess(r.score, 40)

    def test_weights_configurable(self):
        j = mk()
        p1, p2 = self.profile(), self.profile()
        p2.weights = {"role": 0, "experience": 0, "skills": 0, "company": 100, "location": 0, "resume": 0}
        r2 = score_job(j, "P3", "Nobody", p2)
        self.assertLess(r2.score, score_job(j, "P3", "Nobody", p1).score)


class ExclusionTests(unittest.TestCase):
    RULES = ["senior", "staff", "principal", "manager", "phd-only", "hardware-only", "years:5"]

    def test_mentorship_phrase_not_excluded(self):
        t = "Software Engineering Intern — working with senior engineers"
        self.assertEqual(check_exclusions(t, "You'll learn from senior and staff engineers.", "INTERNSHIP", self.RULES), [])

    def test_senior_in_description_only_not_excluded(self):
        self.assertEqual(check_exclusions("Software Engineer", "Partner with senior leadership.", "UNKNOWN", self.RULES), [])

    def test_real_senior_title_excluded(self):
        self.assertTrue(check_exclusions("Senior Software Engineer", "", "EXPERIENCED", self.RULES))
        self.assertTrue(check_exclusions("Engineering Manager", "", "EXPERIENCED", self.RULES))

    def test_years_phd_hardware(self):
        self.assertTrue(check_exclusions("Software Engineer", "Requires 7+ years of experience", "UNKNOWN", self.RULES))
        self.assertTrue(check_exclusions("Research Scientist", "A PhD is required. Must have a doctorate.", "UNKNOWN", self.RULES))
        self.assertTrue(check_exclusions("FPGA Design Engineer", "", "UNKNOWN", self.RULES))
        self.assertEqual(check_exclusions("Hardware-aware Software Engineer Intern", "", "INTERNSHIP", self.RULES), [])


class IngestPlanTests(unittest.TestCase):
    def row(self, j, rid, **kw):
        r = {"id": rid, "ats": j.ats, "externalJobId": j.external_id, "dedupeKey": j.dedupe_key,
             "applicationUrl": j.application_url, "normalizedTitle": j.normalized_title, "location": j.location,
             "description": j.description, "status": "OPEN", "postingHash": j.posting_hash, "version": 1,
             "source": j.source, "missedScans": 0, "snapshot": j.snapshot()}
        r.update(kw); return r

    def plan(self, existing, incoming, seen=None, complete=True):
        seen = {j.external_id for j in incoming} if seen is None else seen
        return plan_ingest(existing, incoming, seen_external_ids=seen, complete_listing=complete,
                           source="greenhouse", ats="GREENHOUSE", now=NOW)

    def test_new_job(self):
        p = self.plan([], [mk("1")])
        self.assertEqual(len(p.inserts), 1)

    def test_unchanged_is_touch_not_duplicate(self):
        j = mk("1")
        p = self.plan([self.row(j, "r1")], [mk("1")])
        self.assertEqual((len(p.inserts), len(p.touches), len(p.updates)), (0, 1, 0))

    def test_change_creates_version_and_diff(self):
        old = mk("1")
        new = mk("1", loc="Chicago, IL")
        p = self.plan([self.row(old, "r1")], [new])
        self.assertEqual(len(p.updates), 1); u = p.updates[0]
        self.assertEqual(u.new_version, 2)
        self.assertTrue(any(c["field"] == "location" for c in u.changes))

    def test_in_scan_duplicates_collapse(self):
        p = self.plan([], [mk("1"), mk("2", url="https://boards.greenhouse.io/acme/jobs/1?gh_src=abc")])
        self.assertEqual(len(p.inserts), 1)

    def test_closure_requires_repeated_misses(self):
        j = mk("1"); other = mk("2", title="Backend Engineer Intern", loc="Austin, TX")
        existing = [self.row(j, "r1"), self.row(other, "r2")]
        p = self.plan(existing, [other], seen={"2"})
        m = {x.row_id: x for x in p.missed}
        self.assertEqual(m["r1"].new_status, "OPEN")                        # first miss: stays open
        existing[0]["missedScans"] = 1
        self.assertEqual({x.row_id: x for x in self.plan(existing, [other], seen={"2"}).missed}["r1"].new_status, "POSSIBLY_CLOSED")
        existing[0]["missedScans"] = 3
        self.assertEqual({x.row_id: x for x in self.plan(existing, [other], seen={"2"}).missed}["r1"].new_status, "CLOSED")

    def test_empty_result_does_not_mass_close(self):
        existing = [self.row(mk(str(i), title=f"Backend Engineer Intern {i}x", loc=f"City{i}"), f"r{i}") for i in range(6)]
        p = self.plan(existing, [], seen=set())
        self.assertEqual(p.missed, []); self.assertIsNotNone(p.skipped_closure_reason)

    def test_incomplete_listing_never_closes(self):
        j = mk("1")
        p = self.plan([self.row(j, "r1")], [], seen=set(), complete=False)
        self.assertEqual(p.missed, [])

    def test_filtered_but_seen_job_not_closed(self):
        j = mk("1")
        p = self.plan([self.row(j, "r1")], [], seen={"1"})       # fetched but filtered as irrelevant
        self.assertEqual(p.missed, [])

    def test_reopen_same_id(self):
        j = mk("1")
        p = self.plan([self.row(j, "r1", status="CLOSED", missedScans=4)], [mk("1")])
        self.assertTrue(p.touches[0].reopened)

    def test_repost_new_id_matches_closed_job(self):
        j = mk("1")
        p = self.plan([self.row(j, "r1", status="CLOSED")], [mk("77")])
        self.assertEqual(len(p.inserts), 0)
        self.assertTrue(p.touches[0].reposted or (p.updates and p.updates[0].reposted))

    def test_official_ats_becomes_primary_over_generic(self):
        j = mk("g1", src="generic", ats="GENERIC_CAREERS_PAGE", url="https://acme.com/c/1")
        row = self.row(j, "r1", source="generic", ats="GENERIC_CAREERS_PAGE")
        gh = mk("55", title=j.title, url="https://acme.com/c/1")
        p = self.plan([row], [gh])
        self.assertTrue(p.add_sources and p.add_sources[0].make_primary)


class DiffTests(unittest.TestCase):
    def test_labels(self):
        a, b = mk("1").snapshot(), mk("1", loc="Chicago, IL").snapshot()
        b["application_deadline"] = "2026-11-01T00:00:00+00:00"
        out = {c["field"]: c for c in diff_snapshots(a, b)}
        self.assertEqual(out["location"]["kind"], "changed")
        self.assertEqual(out["application_deadline"]["summary"], "Application deadline added")


class ConnectorParseTests(unittest.TestCase):
    def test_greenhouse(self):
        jobs = GreenhouseConnector.parse({"jobs": [{"id": 12, "title": "SWE Intern", "absolute_url": "https://boards.greenhouse.io/a/jobs/12",
            "content": "&lt;p&gt;Hi&lt;/p&gt;", "location": {"name": "NYC"}, "departments": [{"name": "Eng"}],
            "updated_at": "2026-10-01T00:00:00Z"}]})
        self.assertEqual((jobs[0].external_id, jobs[0].location, jobs[0].department), ("12", "NYC", "Eng"))
        self.assertIsNone(jobs[0].posted_at)   # updated_at must not masquerade as posted date

    def test_lever(self):
        jobs = LeverConnector.parse([{"id": "abc", "text": "Quant Intern", "hostedUrl": "https://jobs.lever.co/x/abc",
            "createdAt": 1790000000000, "categories": {"location": "Chicago", "team": "Quant", "commitment": "Intern"},
            "description": "<p>d</p>", "workplaceType": "hybrid"}])
        self.assertEqual((jobs[0].title, jobs[0].workplace_type), ("Quant Intern", "hybrid")); self.assertIsNotNone(jobs[0].posted_at)

    def test_ashby_skips_unlisted(self):
        jobs = AshbyConnector.parse({"jobs": [{"id": "1", "title": "A", "jobUrl": "u", "isListed": False},
                                              {"id": "2", "title": "B", "jobUrl": "u2", "applyUrl": "a2", "isRemote": True}]})
        self.assertEqual([j.external_id for j in jobs], ["2"]); self.assertEqual(jobs[0].workplace_type, "remote")

    def test_generic_jsonld(self):
        html = '<script type="application/ld+json">{"@type":"JobPosting","title":"SWE Intern","url":"https://x.com/j/1","datePosted":"2026-10-01","identifier":{"value":"J1"},"description":"<p>x</p>"}</script>'
        jobs = GenericCareersConnector.parse(html, "https://x.com/careers")
        self.assertEqual((jobs[0].external_id, jobs[0].title), ("J1", "SWE Intern"))

    def test_detect_ats(self):
        self.assertEqual(detect_ats("https://boards.greenhouse.io/stripe"), ("GREENHOUSE", "stripe"))
        self.assertEqual(detect_ats("https://job-boards.greenhouse.io/databricks"), ("GREENHOUSE", "databricks"))
        self.assertEqual(detect_ats("https://jobs.lever.co/palantir"), ("LEVER", "palantir"))
        self.assertEqual(detect_ats("https://jobs.ashbyhq.com/ramp"), ("ASHBY", "ramp"))
        self.assertEqual(detect_ats("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"),
                         ("WORKDAY", "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite"))
        self.assertEqual(detect_ats("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x")[1],
                         "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite")
        self.assertEqual(detect_ats("https://jobs.smartrecruiters.com/Visa"), ("SMARTRECRUITERS", "Visa"))
        self.assertEqual(detect_ats("https://careers.icims.com/x")[0], "ICIMS")
        self.assertEqual(detect_ats("https://acme.com/careers"), ("GENERIC_CAREERS_PAGE", None))


if __name__ == "__main__":
    unittest.main()
