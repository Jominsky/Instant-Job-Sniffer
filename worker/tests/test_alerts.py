import os, sys, unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from alerts.rules import rule_matches, alert_applies, has_criteria
from alerts.logic import digest_due, build_message, build_digest, job_line
from alerts import channels

JOB = {"id": "j1", "title": "Quantitative Developer Intern", "description": "C++ low latency trading", "fitScore": 90,
       "experienceLevel": "INTERNSHIP", "roleCategory": "QUANT_DEVELOPER", "targetSeason": "Summer", "targetYear": 2027,
       "seasonProvenance": "ATS", "companyId": "c1", "category": "PROP_TRADING", "priority": "P0", "companyName": "Acme",
       "location": "Chicago, IL", "workMode": "UNKNOWN", "technologies": ["C++", "Linux"], "isExcluded": False, "status": "OPEN",
       "applicationUrl": "https://acme.com/apply", "datePosted": datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)}


class RuleTests(unittest.TestCase):
    def test_critical_alert_example(self):
        rule = {"minFit": 85, "experienceLevels": ["INTERNSHIP"], "seasons": ["Summer"], "years": [2027],
                "roleCategories": ["SWE", "QUANT_DEVELOPER", "QUANT_RESEARCH", "QUANT_TRADING"]}
        self.assertTrue(rule_matches(rule, JOB))
        self.assertFalse(rule_matches({**rule, "minFit": 95}, JOB))
        self.assertFalse(rule_matches(rule, {**JOB, "targetYear": 2026}))

    def test_any_quant_firm_by_category(self):
        self.assertTrue(rule_matches({"categories": ["QUANT", "PROP_TRADING", "HEDGE_FUND"], "experienceLevels": ["INTERNSHIP"]}, JOB))
        self.assertFalse(rule_matches({"categories": ["BIG_TECH"]}, JOB))

    def test_named_companies_union_with_categories(self):
        self.assertTrue(rule_matches({"companyIds": ["c1"]}, JOB))
        self.assertTrue(rule_matches({"companyIds": ["zzz"], "categories": ["PROP_TRADING"]}, JOB))
        self.assertFalse(rule_matches({"companyIds": ["zzz"], "categories": ["QUANT"]}, JOB))

    def test_stated_season_only(self):
        r = {"years": [2027], "statedSeasonOnly": True}
        self.assertTrue(rule_matches(r, JOB))
        self.assertFalse(rule_matches(r, {**JOB, "seasonProvenance": "AI_INFERENCE"}))

    def test_keywords_locations_tech(self):
        self.assertTrue(rule_matches({"keywords": ["c++"]}, JOB))
        self.assertFalse(rule_matches({"keywords": ["rust"]}, JOB))
        self.assertTrue(rule_matches({"locations": ["chicago"]}, JOB))
        self.assertTrue(rule_matches({"locations": ["remote"]}, {**JOB, "workMode": "REMOTE", "location": None}))
        self.assertTrue(rule_matches({"technologies": ["linux"]}, JOB))

    def test_never_matches_excluded_closed_or_empty(self):
        self.assertFalse(rule_matches({"minFit": 1}, {**JOB, "isExcluded": True}))
        self.assertFalse(rule_matches({"minFit": 1}, {**JOB, "status": "CLOSED"}))
        self.assertFalse(rule_matches({}, JOB))               # an empty rule must not spam everything
        self.assertFalse(has_criteria({"keywords": []}))

    def test_watchlist_combination(self):
        wl = {"categories": ["PROP_TRADING"]}
        self.assertTrue(alert_applies({"minFit": 85}, wl, JOB))
        self.assertFalse(alert_applies({"minFit": 85}, {"categories": ["BIG_TECH"]}, JOB))
        self.assertTrue(alert_applies({}, wl, JOB))           # empty alert rule defers to its watchlist
        self.assertFalse(alert_applies({}, None, JOB))
        self.assertFalse(alert_applies({}, {}, JOB))


class DigestTests(unittest.TestCase):
    def t(self, h, m=0, d=5): return datetime(2026, 10, d, h, m, tzinfo=timezone.utc)

    def test_immediate_and_hourly(self):
        self.assertTrue(digest_due("IMMEDIATE", self.t(9), self.t(9, 1)))
        self.assertFalse(digest_due("HOURLY", self.t(9), self.t(9, 59)))
        self.assertTrue(digest_due("HOURLY", self.t(9), self.t(10, 0)))
        self.assertTrue(digest_due("HOURLY", None, self.t(10)))

    def test_morning_once_per_day(self):
        self.assertFalse(digest_due("MORNING", None, self.t(7, 59)))
        self.assertTrue(digest_due("MORNING", None, self.t(8, 0)))
        self.assertTrue(digest_due("MORNING", self.t(8, 5, d=4), self.t(8, 1)))     # sent yesterday
        self.assertFalse(digest_due("MORNING", self.t(8, 5), self.t(15)))           # already sent today
        self.assertFalse(digest_due("EVENING", self.t(18, 1), self.t(23)))
        self.assertTrue(digest_due("EVENING", self.t(8, 5), self.t(18, 30)))

    def test_timezone(self):
        # 12:30 UTC is 08:30 in New York (EDT) -> morning digest due
        self.assertTrue(digest_due("MORNING", None, self.t(12, 30), tz="America/New_York"))
        self.assertFalse(digest_due("MORNING", None, self.t(11, 30), tz="America/New_York"))


class MessageTests(unittest.TestCase):
    def test_message_has_official_link_and_marks_inferred_season(self):
        title, body = build_message(JOB, "new", "http://x.test/")
        self.assertIn("90%", title); self.assertIn("Summer 2027", title); self.assertNotIn("likely", title)
        self.assertIn("https://acme.com/apply", body); self.assertIn("http://x.test/jobs/j1", body)
        t2, _ = build_message({**JOB, "seasonProvenance": "AI_INFERENCE"}, "reopened", "http://x.test")
        self.assertIn("likely", t2); self.assertTrue(t2.startswith("Reopened"))

    def test_mentions_neutralised(self):
        line = job_line({**JOB, "title": "Intern @everyone <@123>"})
        self.assertNotIn("@everyone", line); self.assertNotIn("<@123>", line)

    def test_digest_truncates(self):
        t, b = build_digest([{**JOB, "id": str(i)} for i in range(30)], "http://x.test", limit=25)
        self.assertIn("30 new", t); self.assertIn("and 5 more", b)


class ChannelTests(unittest.TestCase):
    def test_unconfigured_channels_fail_gracefully(self):
        for k in ("SMTP_HOST", "DISCORD_WEBHOOK_URL", "SLACK_WEBHOOK_URL", "TWILIO_ACCOUNT_SID"):
            os.environ.pop(k, None)
        for ok, detail in (channels.send_email("a@b.c", "s", "b"), channels.send_discord("t", "b"),
                           channels.send_slack("t", "b"), channels.send_sms("t", "b"), channels.send_push("t", "b")):
            self.assertFalse(ok); self.assertTrue(detail)


if __name__ == "__main__":
    unittest.main()
