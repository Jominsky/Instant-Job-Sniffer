import os, sys, unittest
from datetime import datetime, timedelta, timezone
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from timeutil import parse_pg_timestamp


class TimeTests(unittest.TestCase):
    def test_aware_utc_and_arithmetic_with_aware_now(self):
        d = parse_pg_timestamp("2026-10-05 12:00:00.123")
        self.assertEqual(d.tzinfo, timezone.utc); self.assertEqual(d.microsecond, 123000)
        self.assertEqual(datetime(2026, 10, 5, 13, tzinfo=timezone.utc) - d, timedelta(minutes=59, seconds=59, microseconds=877000))
        self.assertIsNone(parse_pg_timestamp(None))
        self.assertEqual(parse_pg_timestamp("2026-10-05 12:00:00").second, 0)


if __name__ == "__main__":
    unittest.main()
