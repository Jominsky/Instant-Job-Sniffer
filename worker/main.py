"""One-shot CLI.  python main.py scan [--company SLUG] [--force]   |   python main.py rescore"""
import argparse
import json
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

p = argparse.ArgumentParser()
p.add_argument("command", choices=["scan", "rescore"])
p.add_argument("--company", help="company slug")
p.add_argument("--force", action="store_true", help="ignore scan intervals")
a = p.parse_args()

if a.command == "scan":
    from scheduler import run_once
    print(json.dumps(run_once(a.company, a.force or bool(a.company)), indent=2))
else:
    from scanner import rescore_all
    print(f"rescored {rescore_all()} jobs")
