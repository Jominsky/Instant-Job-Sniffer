import os, sys, unittest
from datetime import timezone
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import CompanyRef
from connectors.rss import RssFeedConnector as RSS
from connectors.http import FetchError, BlockedByRobots
from connectors.registry import detect_ats, get_connector

RSS2 = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Acme Careers</title>
 <item><title>Software Engineering Intern</title><link>https://acme.example/jobs/1</link><guid>job-1</guid>
   <pubDate>Mon, 05 Oct 2026 14:30:00 GMT</pubDate><category>Engineering</category><location>New York, NY</location>
   <description>short</description><content:encoded><![CDATA[<p>Build <b>things</b> in C++.</p>]]></content:encoded></item>
 <item><title>Quant Researcher</title><link>https://acme.example/jobs/2</link><pubDate>Tue, 06 Oct 2026 09:00:00 -0400</pubDate><description>Research</description></item>
 <item><title></title><link>https://acme.example/jobs/3</link></item>
 <item><title>No link</title></item>
</channel></rss>"""

ATOM = """<feed xmlns="http://www.w3.org/2005/Atom"><title>Jobs</title>
 <entry><title>Backend Intern</title><id>tag:acme,2026:42</id><link rel="self" href="https://acme.example/feed/42"/>
   <link rel="alternate" href="https://acme.example/jobs/42"/><updated>2026-10-07T12:00:00Z</updated><summary>Go and Postgres</summary></entry>
</feed>"""

CO = CompanyRef(id="c", name="Acme", slug="acme", ats="RSS_FEED", ats_identifier="https://acme.example/jobs.rss", careers_url="https://acme.example/careers")


class Http:
    def __init__(self, text="", robots=True): self.text, self.robots, self.urls = text, robots, []
    class R:
        def __init__(self, t): self.text = t
    def get(self, url, **kw): self.urls.append(url); return self.R(self.text)
    def allowed_by_robots(self, url): return self.robots


class RssTests(unittest.TestCase):
    def test_rss2_items(self):
        jobs = RSS.parse(RSS2)
        self.assertEqual([j.title for j in jobs], ["Software Engineering Intern", "Quant Researcher"])   # empty title / missing link skipped
        a, b = jobs
        self.assertEqual((a.external_id, a.url, a.location, a.department), ("job-1", "https://acme.example/jobs/1", "New York, NY", "Engineering"))
        self.assertIn("C++", a.description_html)                                  # content:encoded beats the short description
        self.assertEqual(a.posted_at.isoformat(), "2026-10-05T14:30:00+00:00")
        self.assertEqual(b.external_id, "https://acme.example/jobs/2")             # no guid: falls back to the link
        self.assertEqual(b.posted_at.astimezone(timezone.utc).hour, 13)            # -0400 converted to UTC
        self.assertEqual(b.posted_at.tzinfo is not None, True)

    def test_atom_prefers_alternate_link(self):
        [j] = RSS.parse(ATOM)
        self.assertEqual((j.title, j.url, j.external_id), ("Backend Intern", "https://acme.example/jobs/42", "tag:acme,2026:42"))
        self.assertEqual(j.posted_at.isoformat(), "2026-10-07T12:00:00+00:00"); self.assertEqual(j.description_html, "Go and Postgres")

    def test_untrusted_xml_is_rejected(self):
        bomb = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><rss><channel><item><title>&b;</title><link>x</link></item></channel></rss>'
        with self.assertRaises(FetchError): RSS.parse(bomb)
        with self.assertRaises(FetchError): RSS.parse("<rss><channel><item>")                      # malformed
        with self.assertRaises(FetchError): RSS.parse("<html><body>hello</body></html>")            # not a feed
        with self.assertRaises(FetchError): RSS.parse("<rss>" + "x" * 5_000_001 + "</rss>")        # size cap

    def test_fetch_uses_identifier_then_careers_url_and_honours_robots(self):
        h = Http(RSS2); self.assertEqual(len(RSS(h).fetch(CO)), 2); self.assertEqual(h.urls, ["https://acme.example/jobs.rss"])
        co2 = CompanyRef("c", "Acme", "acme", "RSS_FEED", None, "https://acme.example/feed")
        h2 = Http(RSS2); RSS(h2).fetch(co2); self.assertEqual(h2.urls, ["https://acme.example/feed"])
        with self.assertRaises(BlockedByRobots): RSS(Http(RSS2, robots=False)).fetch(CO)
        with self.assertRaises(FetchError): RSS(Http(RSS2)).fetch(CompanyRef("c", "A", "a", "RSS_FEED", None, None))

    def test_never_drives_closure_detection(self):
        self.assertFalse(RSS.complete_listing)

    def test_registry_and_detection(self):
        self.assertIsInstance(get_connector("RSS_FEED"), RSS)
        for u in ["https://acme.example/jobs.rss", "https://acme.example/careers/feed", "https://acme.example/careers/feed/", "https://acme.example/jobs.atom?x=1",
                  "https://acme.example/careers.xml", "https://acme.example/jobs?format=rss"]:
            self.assertEqual(detect_ats(u), ("RSS_FEED", u), u)
        # specific ATSes and ordinary pages are not mistaken for feeds
        self.assertEqual(detect_ats("https://boards.greenhouse.io/stripe")[0], "GREENHOUSE")
        self.assertEqual(detect_ats("https://acme.example/careers")[0], "GENERIC_CAREERS_PAGE")
        self.assertEqual(detect_ats("https://acme.example/feedback")[0], "GENERIC_CAREERS_PAGE")
        self.assertEqual(detect_ats("https://careers.icims.com/x")[0], "ICIMS")


if __name__ == "__main__":
    unittest.main()
