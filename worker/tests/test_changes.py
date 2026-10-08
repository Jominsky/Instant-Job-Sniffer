import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.dirname(__file__))
from db import ensure_psycopg2   # alerts.changes imports store -> psycopg2; use the test stand-in if the real driver is absent
ensure_psycopg2()
from alerts.changes import material_changes, format_change
from pipeline.diff import diff_snapshots


class ChangeTests(unittest.TestCase):
    def test_only_material_fields_notify(self):
        old = {"title": "SWE Intern", "location": "NYC", "description": "a " * 100, "qualifications": "Python", "application_deadline": None}
        new = {**old, "description": "b " * 100, "application_deadline": "2026-11-01T00:00:00+00:00", "location": "Chicago"}
        m = material_changes(diff_snapshots(old, new))
        self.assertIn("Application deadline added", m); self.assertIn("Location changed", m); self.assertEqual(len(m), 2)

    def test_description_only_edit_is_silent(self):
        old = {"title": "T", "description": "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu"}
        new = {**old, "description": "completely different text about something else entirely right here now ok"}
        self.assertEqual(material_changes(diff_snapshots(old, new)), [])

    def test_format_neutralises_mentions(self):
        self.assertNotIn("@everyone", format_change("Acme", "Intern @everyone", ["Salary updated"]))


if __name__ == "__main__":
    unittest.main()
