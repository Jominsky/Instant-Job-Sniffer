"""Integration tests: the REAL scanner/store/dispatcher code against a REAL PostgreSQL.

Skipped unless JOBINTEL_TEST_DSN is set, e.g.
    JOBINTEL_TEST_DSN=postgresql://user:pw@localhost:5432/jobintel_test python -m unittest tests.test_db_integration
WARNING: it DROPS and recreates the `public` schema of that database. Use a scratch database.
The schema is generated from prisma/schema.prisma by tests/db/prisma_to_sql.py (a test fixture, not a migration).
Network is faked: connectors receive canned Greenhouse JSON.
"""
import os, subprocess, sys, types, unittest
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
DSN = os.environ.get("JOBINTEL_TEST_DSN")

if DSN:
    from db import ensure_psycopg2
    ensure_psycopg2()
    import config
    config.DATABASE_URL = DSN
    import store, scanner
    from alerts import dispatcher
    from alerts.changes import notify_changes
    from connectors.http import FetchError
    from db.prisma_to_sql import generate
    import psycopg2.extras as _extras

SCHEMA = os.path.join(os.path.dirname(os.path.dirname(HERE)), "prisma", "schema.prisma")
TABLES = ["User", "Company", "Job", "ScanRun", "AlertEvent", "Notification", "Alert", "Profile", "Resume", "SavedJob", "Application", "JobSource", "JobVersion"]


def now():
    return datetime.now(timezone.utc)


def q(sql, params=None):
    with store.connect() as conn:
        with store.dict_cursor(conn) as cur:
            cur.execute(sql, params)
            return cur.fetchall() if sql.lstrip().upper().startswith(("SELECT", "WITH")) else cur.rowcount


def one(sql, params=None):
    rows = q(sql, params)
    return rows[0] if rows else None


class FakeHttp:
    def __init__(self, payload=None, error=None, text=""):
        self.payload, self.error, self.text = payload, error, text

    def get(self, url, **kw):
        if self.error:
            raise self.error
        return types.SimpleNamespace(json=lambda: self.payload, text=self.text)

    def allowed_by_robots(self, url):
        return True


def ghjob(i, title, loc="New York, NY", published=None, desc=None):
    return {"id": i, "title": title, "absolute_url": f"https://boards.greenhouse.io/acme/jobs/{i}", "location": {"name": loc},
            "departments": [{"name": "Engineering"}], "first_published": (published or now() - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S+00:00"),
            "content": desc or f"<p>{title}. Summer 2027 internship.</p><h3>Qualifications</h3><ul><li>Python or C++</li><li>Linux</li></ul><script>alert(1)</script>"}


A = lambda **kw: ghjob(1, "Software Engineering Intern", "New York, NY", **kw)
B = lambda **kw: ghjob(2, "Quantitative Developer Intern", "Chicago, IL", **kw)
SENIOR = lambda: ghjob(3, "Senior Software Engineer", "Austin, TX")


@unittest.skipUnless(DSN, "set JOBINTEL_TEST_DSN to run database integration tests")
class DbCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(SCHEMA) as fh:
            ddl = generate(fh.read())
        script = "DROP SCHEMA public CASCADE; CREATE SCHEMA public;\n" + ddl
        r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", DSN], input=script, text=True, capture_output=True)
        assert r.returncode == 0, r.stderr

    def setUp(self):
        q('TRUNCATE ' + ", ".join(f'"{t}"' for t in TABLES) + " CASCADE")

    # ---- seed helpers ----
    def company(self, slug="acme", priority="P0", last_ok=None, fails=0, checked=None, ident="acme", ats="GREENHOUSE"):
        cid = store.cuid()
        q('INSERT INTO "Company"(id,name,slug,"atsProvider","atsIdentifier",category,priority,"lastSuccessfulScanAt","lastCheckedAt","consecutiveFailures","updatedAt") '
          "VALUES (%s,%s,%s,%s,%s,'QUANT',%s,%s,%s,%s,%s)", (cid, slug.title(), slug, ats, ident, priority, last_ok, checked, fails, now()))
        return cid

    def user(self, email="me@x.test", skills=("Python", "C++"), **profile):
        uid = store.cuid()
        q('INSERT INTO "User"(id,email,"passwordHash") VALUES (%s,%s,%s)', (uid, email, "x"))
        q('INSERT INTO "Profile"(id,"userId",skills,"preferredRoles","preferredLocations","graduationYear","updatedAt") VALUES (%s,%s,%s,%s,%s,%s,%s)',
          (store.cuid(), uid, list(skills), ["SWE", "QUANT_DEVELOPER"], ["New York", "Chicago"], 2028, now()))
        return uid

    def alert(self, uid, rule, channels=("BROWSER",), freq="IMMEDIATE"):
        aid = store.cuid()
        q('INSERT INTO "Alert"(id,"userId",name,"ruleJson",channels,frequency,"isActive","createdAt") VALUES (%s,%s,%s,%s,%s::"NotificationChannel"[],%s::"DigestFrequency",true,%s)',
          (aid, uid, "test alert", _extras.Json(rule), list(channels), freq, now()))
        return aid

    def scan(self, slug="acme", jobs=(), error=None, payload=None, text=""):
        with store.connect() as conn:
            profile = store.load_profile(conn)
            [co] = store.due_companies(conn, now(), slug, True)
        return scanner.scan_company(co, profile, FakeHttp(payload if payload is not None else {"jobs": list(jobs)}, error, text), None)

    def jobs(self, **where):
        return q('SELECT * FROM "Job" ORDER BY title')


class ScanTests(DbCase):
    def test_first_scan_persists_everything(self):
        cid = self.company(); self.user()
        r = self.scan(jobs=[A(), B(), SENIOR()])
        self.assertEqual((r["status"], r["found"], r["new"]), ("SUCCESS", 3, 2), r)
        jobs = {j["externalJobId"]: j for j in q('SELECT * FROM "Job"')}
        self.assertEqual(set(jobs), {"1", "2"})                                  # the senior role is filtered, never stored
        j1, j2 = jobs["1"], jobs["2"]
        self.assertEqual((j1["experienceLevel"], j1["roleCategory"], j1["status"], j1["version"]), ("INTERNSHIP", "SWE", "OPEN", 1))
        self.assertEqual(j2["roleCategory"], "QUANT_DEVELOPER")
        self.assertEqual((j1["targetSeason"], j1["targetYear"], j1["seasonProvenance"]), ("Summer", 2027, "ATS"))
        self.assertIn("Python", j1["technologies"]); self.assertIn("C++", j1["technologies"])
        self.assertNotIn("<", j1["description"]); self.assertNotIn("alert(1)", j1["description"])    # sanitised before storage
        self.assertIsNotNone(j1["fitScore"]); self.assertIn("reasons", j1["fitExplanation"]); self.assertIsInstance(j1["concerns"], list)
        self.assertFalse(j1["isExcluded"]); self.assertEqual(j1["exclusionReasons"] or [], [])
        self.assertEqual(j1["firstDiscoveredAt"].tzinfo, timezone.utc)            # aware UTC round-trip
        self.assertLess(abs((j1["datePosted"] - (now() - timedelta(days=1))).total_seconds()), 5)
        self.assertEqual(one('SELECT count(*) AS n FROM "JobVersion"')["n"], 2)
        src = q('SELECT * FROM "JobSource"'); self.assertEqual((len(src), all(s["isPrimary"] for s in src)), (2, True))
        run = one('SELECT * FROM "ScanRun"'); self.assertEqual((run["status"], run["jobsFound"], run["jobsNew"]), ("SUCCESS", 3, 2)); self.assertIsNotNone(run["finishedAt"])
        co = one('SELECT * FROM "Company" WHERE id=%s', (cid,))
        self.assertIsNotNone(co["lastSuccessfulScanAt"]); self.assertEqual((co["consecutiveFailures"], co["openMatchingJobsCount"], co["totalJobsDiscovered"]), (0, 2, 2))

    def test_rescan_is_idempotent(self):
        self.company(); self.user()
        self.scan(jobs=[A(), B()])
        first = {j["externalJobId"]: j["lastObservedAt"] for j in q('SELECT * FROM "Job"')}
        r = self.scan(jobs=[A(), B()])
        self.assertEqual((r["new"], r["updated"]), (0, 0), r)
        self.assertEqual(one('SELECT count(*) AS n FROM "Job"')["n"], 2); self.assertEqual(one('SELECT count(*) AS n FROM "JobVersion"')["n"], 2)
        self.assertEqual(one('SELECT count(*) AS n FROM "ScanRun"')["n"], 2)
        for j in q('SELECT * FROM "Job"'):
            self.assertGreaterEqual(j["lastObservedAt"], first[j["externalJobId"]])

    def test_edit_creates_new_version_with_diff(self):
        self.company(); self.user()
        self.scan(jobs=[A()])
        r = self.scan(jobs=[ghjob(1, "Software Engineering Intern", "Chicago, IL")])
        self.assertEqual((r["new"], r["updated"]), (0, 1), r)
        j = one('SELECT * FROM "Job"'); self.assertEqual((j["version"], j["location"]), (2, "Chicago, IL"))
        vs = q('SELECT * FROM "JobVersion" ORDER BY version'); self.assertEqual([v["version"] for v in vs], [1, 2])
        self.assertIsNone(vs[0]["diff"])
        self.assertTrue(any(c["field"] == "location" and c["old"] == "New York, NY" and c["new"] == "Chicago, IL" for c in vs[1]["diff"]), vs[1]["diff"])

    def test_closure_progression_then_reopen_without_duplicate(self):
        self.company(); self.user()
        self.scan(jobs=[A(), B()])
        seen = []
        for _ in range(4):
            self.scan(jobs=[A()])
            b = one('SELECT status,"missedScans","closedAt" FROM "Job" WHERE "externalJobId"=%s', ("2",))
            seen.append((b["status"], b["missedScans"]))
        self.assertEqual(seen, [("OPEN", 1), ("POSSIBLY_CLOSED", 2), ("POSSIBLY_CLOSED", 3), ("CLOSED", 4)])
        self.assertIsNotNone(one('SELECT "closedAt" FROM "Job" WHERE "externalJobId"=%s', ("2",))["closedAt"])
        self.assertEqual(one('SELECT status FROM "Job" WHERE "externalJobId"=%s', ("1",))["status"], "OPEN")
        self.scan(jobs=[A(), B()])                                                  # it comes back
        b = one('SELECT * FROM "Job" WHERE "externalJobId"=%s', ("2",))
        self.assertEqual((b["status"], b["missedScans"], b["closedAt"]), ("OPEN", 0, None)); self.assertIsNotNone(b["reopenedAt"])
        self.assertEqual(one('SELECT count(*) AS n FROM "Job"')["n"], 2)             # reopened, not re-created

    def test_failed_scan_touches_no_jobs_and_backs_off(self):
        cid = self.company(); self.user()
        self.scan(jobs=[A(), B()])
        ok_at = one('SELECT "lastSuccessfulScanAt" AS t FROM "Company"')["t"]
        r = self.scan(error=FetchError("HTTP 500 from boards-api"))
        self.assertEqual(r["status"], "FAILURE")
        self.assertEqual([j["status"] for j in q('SELECT status FROM "Job"')], ["OPEN", "OPEN"])
        co = one('SELECT * FROM "Company"'); self.assertEqual(co["consecutiveFailures"], 1); self.assertEqual(co["lastSuccessfulScanAt"], ok_at)
        run = one('SELECT * FROM "ScanRun" WHERE status=%s', ("FAILURE",)); self.assertIn("HTTP 500", run["errorMessage"])
        with store.connect() as conn:
            self.assertEqual(store.due_companies(conn, now()), [])                   # just checked + backoff: not due

    def test_empty_listing_never_mass_closes(self):
        self.company(); self.user()
        titles = [("Software Engineer Intern", "New York, NY"), ("Backend Engineer Intern", "Austin, TX"), ("Quantitative Developer Intern", "Chicago, IL"),
                  ("Machine Learning Engineer Intern", "Boston, MA"), ("Data Engineer Intern", "Seattle, WA")]
        self.scan(jobs=[ghjob(i + 1, t, l) for i, (t, l) in enumerate(titles)])
        r = self.scan(jobs=[])
        self.assertEqual(r["status"], "SUCCESS"); self.assertIn("suspect", r["closure_note"])
        self.assertEqual({j["status"] for j in q('SELECT status FROM "Job"')}, {"OPEN"})

    def test_same_job_under_new_id_adds_source_instead_of_duplicating(self):
        self.company(); self.user()
        self.scan(jobs=[A()])
        self.scan(jobs=[ghjob(99, "Software Engineering Intern", "New York, NY")])   # same title/location, new external id and URL
        self.assertEqual(one('SELECT count(*) AS n FROM "Job"')["n"], 1)
        self.assertEqual(sorted(s["externalJobId"] for s in q('SELECT * FROM "JobSource"')), ["1", "99"])


def feed(*items):
    body = "".join(f"<item><title>{t}</title><link>https://acme.example/jobs/{i}</link><guid>g{i}</guid><pubDate>{d}</pubDate><location>{l}</location>"
                   f"<description>&lt;p&gt;Summer 2027 internship. Python, Linux.&lt;/p&gt;</description></item>" for i, t, l, d in items)
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>Acme</title>{body}</channel></rss>'


class FeedScanTests(DbCase):
    D = now().strftime("%a, %d %b %Y %H:%M:%S +0000")

    def test_rss_feed_scan_inserts_jobs_and_never_closes_on_absence(self):
        self.company(ats="RSS_FEED", ident="https://acme.example/jobs.rss"); self.user()
        both = feed((1, "Software Engineering Intern", "New York, NY", self.D), (2, "Quantitative Developer Intern", "Chicago, IL", self.D))
        r = self.scan(text=both)
        self.assertEqual((r["status"], r["new"]), ("SUCCESS", 2), r)
        j = one('SELECT * FROM "Job" WHERE "externalJobId"=%s', ("g1",))
        self.assertEqual((j["ats"], j["source"], j["experienceLevel"], j["applicationUrl"]), ("RSS_FEED", "rss", "INTERNSHIP", "https://acme.example/jobs/1"))
        for _ in range(5):                                                            # feed now shows only one item, scan after scan
            self.scan(text=feed((1, "Software Engineering Intern", "New York, NY", self.D)))
        self.assertEqual({x["status"] for x in q('SELECT status FROM "Job"')}, {"OPEN"})   # a recent-items feed can't prove closure
        self.assertEqual(one('SELECT count(*) AS n FROM "Job"')["n"], 2)

    def test_malicious_feed_fails_the_scan_without_touching_data(self):
        self.company(ats="RSS_FEED", ident="https://acme.example/jobs.rss"); self.user()
        self.scan(text=feed((1, "Software Engineering Intern", "New York, NY", self.D)))
        r = self.scan(text='<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><rss><channel/></rss>')
        self.assertEqual(r["status"], "FAILURE"); self.assertEqual(one('SELECT count(*) AS n FROM "Job" WHERE status=%s', ("OPEN",))["n"], 1)


class PayTests(DbCase):
    def test_hourly_pay_is_stored_with_period_and_annualised_max(self):
        self.company(); self.user()
        self.scan(jobs=[ghjob(1, "Software Engineering Intern", desc="<p>Pay: $45 - $55 per hour. Summer 2027 internship.</p>"),
                        ghjob(2, "Quantitative Developer Intern", "Chicago, IL", desc="<p>Stipend $11,500 / month. Summer 2027.</p>"),
                        ghjob(4, "Backend Engineer Intern", "Austin, TX", desc="<p>Salary $120,000 - $140,000 per year.</p>"),
                        ghjob(5, "Data Engineer Intern", "Seattle, WA", desc="<p>Our fund raised $5 million.</p>")])
        j = {x["externalJobId"]: x for x in q('SELECT * FROM "Job"')}
        self.assertEqual((j["1"]["compensationMin"], j["1"]["compensationMax"], j["1"]["compensationPeriod"], j["1"]["compensationAnnualMax"]), (45, 55, "HOUR", 114400))
        self.assertEqual((j["2"]["compensationMax"], j["2"]["compensationPeriod"], j["2"]["compensationAnnualMax"]), (11500, "MONTH", 138000))
        self.assertEqual((j["4"]["compensationPeriod"], j["4"]["compensationAnnualMax"]), ("YEAR", 140000))
        self.assertEqual((j["5"]["compensationMax"], j["5"]["compensationPeriod"], j["5"]["compensationRaw"]), (None, None, None))   # never invented
        self.assertEqual(j["1"]["compensationRaw"], "$45 - $55 per hour")   # the employer's own wording is kept

    def test_minimum_pay_concern_uses_annualised_pay_and_legacy_rows(self):
        self.company(); self.user()
        self.scan(jobs=[ghjob(1, "Software Engineering Intern", desc="<p>Pay: $60 per hour. Summer 2027.</p>"),
                        ghjob(2, "Quantitative Developer Intern", "Chicago, IL", desc="<p>Summer 2027.</p>")])
        legacy = one('SELECT id FROM "Job" WHERE "externalJobId"=%s', ("2",))["id"]
        q('UPDATE "Job" SET "compensationMax"=80000,"compensationMin"=70000,"compensationPeriod"=NULL,"compensationAnnualMax"=NULL WHERE id=%s', (legacy,))   # stored before pay periods existed
        q('UPDATE "Profile" SET "minCompensation"=100000')
        scanner.rescore_all()
        c = {x["externalJobId"]: x["concerns"] for x in q('SELECT * FROM "Job"')}
        self.assertNotIn("Compensation below your minimum", c["1"])      # $60/h is about $124,800 a year
        self.assertIn("Compensation below your minimum", c["2"])         # legacy annual $80k is below $100k


class SchedulingTests(DbCase):
    def test_due_companies_respects_priority_intervals_and_backoff(self):
        ago = lambda s: now() - timedelta(seconds=s)
        self.company("p0-due", "P0", checked=ago(400)); self.company("p0-fresh", "P0", checked=ago(100)); self.company("p3-wait", "P3", checked=ago(3600))
        self.company("p0-backoff", "P0", checked=ago(400), fails=2)           # 300s * 2^2 = 1200s > 400s
        self.company("never", "P2", checked=None); self.company("nourl", "P1", ats="UNKNOWN", ident=None)
        q('UPDATE "Company" SET "isActive"=false WHERE slug=%s', ("p3-wait",))
        with store.connect() as conn:
            slugs = [c.slug for c in store.due_companies(conn, now())]
        self.assertEqual(sorted(slugs), ["never", "p0-due"])

    def test_profile_and_signature(self):
        self.user(); 
        with store.connect() as conn:
            p = store.load_profile(conn); sig = store.profile_signature(conn)
        self.assertEqual((p.skills, p.graduation_year, p.weights["role"], p.target_year), (["Python", "C++"], 2028, 30, 2027))
        self.assertIn("senior", p.exclusion_rules)                                   # default rules apply when none stored
        q('UPDATE "Profile" SET skills=%s,"exclusionRules"=%s,"updatedAt"=%s', (["Rust"], ["kw:intern"], now() + timedelta(seconds=5)))
        with store.connect() as conn:
            p2 = store.load_profile(conn); sig2 = store.profile_signature(conn)
        self.assertEqual((p2.skills, p2.exclusion_rules), (["Rust"], ["kw:intern"])); self.assertNotEqual(sig, sig2)

    def test_rescore_all_applies_profile_changes(self):
        self.company(); self.user(skills=("Rust",))
        self.scan(jobs=[A(), B()])
        before = {j["externalJobId"]: j["fitScore"] for j in q('SELECT * FROM "Job"')}
        q('UPDATE "Profile" SET skills=%s,"exclusionRules"=%s', (["Python", "C++", "Linux"], ["kw:quantitative"]))
        self.assertEqual(scanner.rescore_all(), 2)
        after = {j["externalJobId"]: j for j in q('SELECT * FROM "Job"')}
        self.assertGreater(after["1"]["fitScore"], before["1"])
        self.assertFalse(after["1"]["isExcluded"]); self.assertTrue(after["2"]["isExcluded"])
        self.assertIn("Title contains excluded keyword 'quantitative'", after["2"]["exclusionReasons"])


class AlertTests(DbCase):
    RULE = {"experienceLevels": ["INTERNSHIP"]}

    def test_first_scan_only_alerts_on_fresh_jobs_and_never_duplicates(self):
        self.company(); uid = self.user(); self.alert(uid, self.RULE)
        fresh, old = ghjob(1, "Software Engineering Intern", published=now() - timedelta(hours=1)), ghjob(2, "Quantitative Developer Intern", "Chicago, IL", published=now() - timedelta(days=30))
        self.scan(jobs=[fresh, old])
        ev = q('SELECT * FROM "AlertEvent"'); self.assertEqual(len(ev), 1)
        self.assertEqual((ev[0]["status"], ev[0]["reason"], ev[0]["attempts"]), ("SENT", "new", 1)); self.assertIsNotNone(ev[0]["deliveredAt"])
        n = q('SELECT * FROM "Notification"'); self.assertEqual(len(n), 1); self.assertTrue(n[0]["title"].startswith("New:")); self.assertIn("Software Engineering Intern", n[0]["title"])
        self.scan(jobs=[fresh, old])                                                  # rescan: nothing new
        self.assertEqual(one('SELECT count(*) AS n FROM "AlertEvent"')["n"], 1)
        self.scan(jobs=[fresh, old, ghjob(3, "Backend Engineer Intern", "Austin, TX", published=now() - timedelta(minutes=10))])
        self.assertEqual(one('SELECT count(*) AS n FROM "AlertEvent"')["n"], 2)       # later scans alert on any new match
        self.assertEqual(one('SELECT count(*) AS n FROM "Notification"')["n"], 2)

    def test_hourly_digest_batches_then_waits(self):
        self.company(last_ok=now() - timedelta(days=1)); uid = self.user(); aid = self.alert(uid, self.RULE, freq="HOURLY")
        jobs = [ghjob(i, t, l) for i, (t, l) in enumerate([("Software Engineer Intern", "New York, NY"), ("Backend Engineer Intern", "Austin, TX"), ("Data Engineer Intern", "Seattle, WA")], start=1)]
        self.scan(jobs=jobs)
        n = q('SELECT * FROM "Notification"'); self.assertEqual(len(n), 1); self.assertIn("3 new matching jobs", n[0]["title"])
        self.assertEqual({e["status"] for e in q('SELECT * FROM "AlertEvent"')}, {"SENT"})
        self.assertIsNotNone(one('SELECT "lastDigestAt" AS t FROM "Alert" WHERE id=%s', (aid,))["t"])
        self.scan(jobs=jobs + [ghjob(4, "Machine Learning Engineer Intern", "Boston, MA")])
        self.assertEqual(one('SELECT count(*) AS n FROM "Notification"')["n"], 1)      # digest window not elapsed: held back
        self.assertEqual([e["status"] for e in q('SELECT * FROM "AlertEvent" WHERE status=%s', ("PENDING",))], ["PENDING"])

    def test_burst_is_rolled_into_one_message(self):
        self.company(last_ok=now() - timedelta(days=1)); uid = self.user(); self.alert(uid, self.RULE)
        cities = ["New York, NY", "Austin, TX", "Chicago, IL", "Boston, MA", "Seattle, WA", "Denver, CO", "Miami, FL"]
        self.scan(jobs=[ghjob(i + 1, f"Software Engineer Intern {c.split(',')[0]}", c) for i, c in enumerate(cities)])
        titles = [n["title"] for n in q('SELECT * FROM "Notification"')]
        self.assertEqual(len(titles), dispatcher.MAX_IMMEDIATE_PER_RUN + 1); self.assertTrue(any("2 new matching jobs" in t for t in titles))

    def test_unconfigured_channel_fails_retries_three_times_then_stops(self):
        for k in ("SMTP_HOST",):
            os.environ.pop(k, None)
        self.company(last_ok=now() - timedelta(days=1)); uid = self.user(); self.alert(uid, self.RULE, channels=("EMAIL",))
        self.scan(jobs=[A()])
        self.assertEqual(one('SELECT status,attempts FROM "AlertEvent"')["attempts"], 1)
        for _ in range(5):
            with store.connect() as conn:
                dispatcher.deliver(conn, now())
        e = one('SELECT * FROM "AlertEvent"'); self.assertEqual((e["status"], e["attempts"]), ("FAILED", dispatcher.MAX_ATTEMPTS))
        self.assertFalse(e["channelResults"]["EMAIL"]["ok"]); self.assertEqual(one('SELECT count(*) AS n FROM "Notification"')["n"], 0)

    def test_alert_skips_jobs_that_stop_matching(self):
        self.company(last_ok=now() - timedelta(days=1)); uid = self.user()
        self.alert(uid, {"minFit": 100})                                              # nothing realistically scores 100
        self.scan(jobs=[A()]); self.assertEqual(one('SELECT count(*) AS n FROM "AlertEvent"')["n"], 0)

    def test_tracked_job_change_notifications(self):
        self.company(); uid = self.user()
        self.scan(jobs=[A(), B()])
        j = {x["externalJobId"]: x["id"] for x in q('SELECT * FROM "Job"')}
        q('INSERT INTO "SavedJob"(id,"userId","jobId","notInterested") VALUES (%s,%s,%s,false)', (store.cuid(), uid, j["1"]))
        q('INSERT INTO "SavedJob"(id,"userId","jobId","notInterested") VALUES (%s,%s,%s,true)', (store.cuid(), uid, j["2"]))   # dismissed: no ping
        deadline = [{"field": "application_deadline", "summary": "Application deadline added"}]
        with store.connect() as conn:
            self.assertEqual(notify_changes(conn, [(j["1"], deadline), (j["2"], deadline), (j["1"], [{"field": "description", "summary": "Description changed"}])], now()), 1)
        n = one('SELECT * FROM "Notification"'); self.assertEqual(n["userId"], uid); self.assertIn("Application deadline added", n["title"]); self.assertEqual(n["jobId"], j["1"])


if __name__ == "__main__":
    unittest.main()
