import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import CompanyRef
from connectors.smartrecruiters import SmartRecruitersConnector as SR
from connectors.workday import WorkdayConnector as WD
from connectors.http import FetchError
from connectors.detail_cache import DetailCache
from pipeline.relevance import title_is_candidate

CO = CompanyRef(id="c", name="Visa", slug="visa", ats="SMARTRECRUITERS", ats_identifier="Visa", careers_url=None)


class FakeHttp:
    """Serves canned JSON so connector control flow (pagination, detail budget, caching) is tested without a network."""
    def __init__(self, routes, posts=None): self.routes, self.posts, self.calls = routes, posts or {}, []
    class R:
        def __init__(self, d): self.d = d
        def json(self): return self.d
    def get(self, url, **kw):
        self.calls.append(("GET", url))
        for k, v in self.routes.items():
            if url.startswith(k): return self.R(v(url) if callable(v) else v)
        raise FetchError("404 " + url)
    def post_json(self, url, payload, **kw):
        self.calls.append(("POST", url, payload["searchText"], payload["offset"]))
        return self.R(self.posts[(payload["searchText"], payload["offset"])] if (payload["searchText"], payload["offset"]) in self.posts else {"jobPostings": []})
    def allowed_by_robots(self, url): return True


class RelevanceTests(unittest.TestCase):
    def test_candidates(self):
        self.assertTrue(title_is_candidate("Software Engineer Intern"))
        self.assertTrue(title_is_candidate("Quantitative Researcher"))
        self.assertFalse(title_is_candidate("Senior Software Engineer"))
        self.assertFalse(title_is_candidate("Office Manager"))


class SmartRecruitersTests(unittest.TestCase):
    LIST = {"totalFound": 2, "content": [
        {"id": "1", "name": "Software Engineer Intern", "releasedDate": "2026-10-01T10:00:00.000Z",
         "location": {"city": "New York", "region": "NY", "country": "us", "remote": False}, "department": {"label": "Eng"}},
        {"id": "2", "name": "Office Manager", "location": {"city": "Austin", "country": "us"}}]}
    DETAIL = {"postingUrl": "https://jobs.smartrecruiters.com/Visa/1-swe-intern", "applyUrl": "https://jobs.smartrecruiters.com/Visa/1?oga=true",
              "jobAd": {"sections": {"jobDescription": {"text": "<p>Build things</p>"}, "qualifications": {"text": "<ul><li>Python</li></ul>"}}}}

    def test_fetch_details_only_for_candidates_and_caches(self):
        http = FakeHttp({"https://api.smartrecruiters.com/v1/companies/Visa/postings?": self.LIST,
                         "https://api.smartrecruiters.com/v1/companies/Visa/postings/1": self.DETAIL})
        c = SR(http)
        jobs = c.fetch(CO)
        by = {j.external_id: j for j in jobs}
        self.assertIn("Python", by["1"].description_html); self.assertEqual(by["1"].location, "New York, NY, US")
        self.assertTrue(by["1"].url.startswith("https://jobs.smartrecruiters.com/Visa/1"))
        self.assertTrue(by["2"].extra.get("stub")); self.assertFalse(by["1"].extra.get("stub"))
        n_detail = sum(1 for k in http.calls if k[1].endswith("/postings/1") or "/postings/2" in k[1])
        self.assertEqual(n_detail, 1)                       # no detail call for the irrelevant title
        c.fetch(CO)
        self.assertEqual(sum(1 for k in http.calls if k[1].endswith("/postings/1")), 1)   # second scan served from cache

    def test_missing_identifier(self):
        with self.assertRaises(FetchError): SR(FakeHttp({})).fetch(CompanyRef("c", "X", "x", "SMARTRECRUITERS", None, None))


class WorkdayTests(unittest.TestCase):
    def test_identifier(self):
        self.assertEqual(WD.split_identifier("h|t|s"), ("h", "t", "s"))
        with self.assertRaises(FetchError): WD.split_identifier("bad")

    def test_parse_and_detail(self):
        raw = WD.parse_item({"title": "Software Engineer Intern", "externalPath": "/job/US-CA-Santa-Clara/SWE-Intern_JR1999", "locationsText": "Santa Clara, CA",
                             "postedOn": "Posted Today", "bulletFields": ["JR1999"]}, "nv.wd5.myworkdayjobs.com", "Ext")
        self.assertEqual((raw.external_id, raw.location), ("JR1999", "Santa Clara, CA"))
        self.assertIsNone(raw.posted_at)                    # relative 'Posted Today' is not turned into a fabricated date
        WD.apply_detail(raw, {"jobPostingInfo": {"jobDescription": "<p>Hi</p>", "externalUrl": "https://nv.wd5.myworkdayjobs.com/Ext/job/x", "startDate": "2026-10-02", "jobReqId": "JR1999"}})
        self.assertEqual(raw.posted_at.date().isoformat(), "2026-10-02"); self.assertEqual(raw.external_id, "JR1999")

    def test_fetch_never_claims_complete_listing_and_budgets_details(self):
        self.assertFalse(WD.complete_listing)
        postings = [{"title": f"Software Engineer Intern {i}", "externalPath": f"/job/p{i}", "bulletFields": [f"JR{i}"]} for i in range(20)]
        http = FakeHttp({"https://h.wd5.myworkdayjobs.com/wday/cxs/t/s/job/": {"jobPostingInfo": {"jobDescription": "<p>d</p>"}}},
                        posts={("intern", 0): {"jobPostings": postings}})
        c = WD(http)
        jobs = c.fetch(CompanyRef("c", "NV", "nv", "WORKDAY", "h.wd5.myworkdayjobs.com|t|s", None))
        self.assertEqual(len(jobs), 20); self.assertTrue(all(not j.extra.get("stub") for j in jobs))


class CacheTests(unittest.TestCase):
    def test_ttl(self):
        c = DetailCache(ttl_seconds=0); c.put("a", 1); self.assertIsNone(c.get("a"))
        c = DetailCache(); c.put("a", 1); self.assertEqual(c.get("a"), 1)


if __name__ == "__main__":
    unittest.main()
