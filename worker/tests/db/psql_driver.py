"""A minimal, TEST-ONLY stand-in for psycopg2 that talks to PostgreSQL through one persistent `psql` process.

Why it exists: the worker's persistence layer (store.py, alerts/*) must be exercised against a real database, but the build
sandbox can't install psycopg2. install() registers fake `psycopg2`, `psycopg2.extensions` and `psycopg2.extras` modules that
implement exactly the subset the worker uses. It copies psycopg2's *semantics* where they matter for catching bugs:
client-side parameter interpolation, implicit transactions (BEGIN on first statement), tz-aware datetime literals, `Json`
wrapping that REFUSES to adapt plain dicts, registered type casters (without one, timestamps come back naive, like psycopg2).
It is NOT a production driver and is only used when the real psycopg2 is missing (see test_db_integration.py).
"""
from __future__ import annotations
import json
import os
import re
import subprocess
import sys
import types
import uuid
from datetime import date, datetime
from typing import Any
from urllib.parse import urlsplit


class Error(Exception):
    pass


class ProgrammingError(Error):
    pass


class Json:
    def __init__(self, obj: Any):
        self.obj = obj


class _Type:
    def __init__(self, oids, name, func):
        self.oids, self.name, self.func = oids, name, func


_casters: dict[int, Any] = {}
_TS = re.compile(r"^\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(\.\d+)?$")


def _lit(s: str) -> str:
    if "\x00" in s:
        raise ValueError("A string literal cannot contain NUL (0x00) characters.")
    return "'" + s.replace("'", "''") + "'"


def adapt(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        return _lit(v)
    if isinstance(v, datetime):
        return f"{_lit(v.isoformat())}::{'timestamptz' if v.tzinfo else 'timestamp'}"
    if isinstance(v, date):
        return f"{_lit(v.isoformat())}::date"
    if isinstance(v, Json):
        return _lit(json.dumps(v.obj))                 # like psycopg2: raises TypeError for non-serialisable values
    if isinstance(v, (list, tuple)):
        if not v:
            return "'{}'"
        return "ARRAY[" + ",".join(adapt(x) for x in v) + "]"
    raise ProgrammingError(f"can't adapt type '{type(v).__name__}'")


_PH = re.compile(r"%(?:\((\w+)\))?s|%%")


def interpolate(sql: str, params: Any) -> str:
    if params is None:
        return sql
    pos = iter(params) if not isinstance(params, dict) else None

    def sub(m: re.Match) -> str:
        if m.group(0) == "%%":
            return "%"
        return adapt(params[m.group(1)] if m.group(1) else next(pos))

    out = _PH.sub(sub, sql)
    if pos is not None and next(pos, StopIteration) is not StopIteration:
        raise ProgrammingError("not all arguments converted during string formatting")
    return out


class _Psql:
    def __init__(self, dsn: str, options: str | None):
        u = urlsplit(dsn)
        env = dict(os.environ, PGOPTIONS=options or "", **({"PGPASSWORD": u.password} if u.password else {}))
        clean = dsn.replace(f":{u.password}@", "@") if u.password else dsn
        self.p = subprocess.Popen(["psql", "-X", "-q", "-t", "-A", "-v", "VERBOSITY=terse", clean], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=env)

    def run(self, sql: str) -> str:
        end = f"__END_{uuid.uuid4().hex}__"
        self.p.stdin.write(sql.rstrip().rstrip(";") + ";\n\\echo " + end + "\n")
        self.p.stdin.flush()
        lines = []
        for line in self.p.stdout:
            if line.rstrip("\n") == end:
                break
            lines.append(line.rstrip("\n"))
        text = "\n".join(lines)
        errs = [l for l in lines if l.startswith("ERROR:") or l.startswith("FATAL:")]
        if errs:
            raise Error(errs[0])
        return text

    def close(self):
        try:
            self.p.stdin.write("\\q\n")
            self.p.stdin.flush()
        except (BrokenPipeError, ValueError):
            pass
        self.p.wait(timeout=10)


def _pairs(pairs):
    """JSON objects as ordered (key, value) lists so duplicate column names survive; nested json columns are turned back into dicts."""
    return _Row(pairs)


class _Row(list):
    pass


def _plain(v):
    if isinstance(v, _Row):
        return {k: _plain(x) for k, x in v}
    if isinstance(v, list):
        return [_plain(x) for x in v]
    return v


class Cursor:
    def __init__(self, conn: "Connection", dict_rows: bool):
        self.conn, self.dict_rows, self.rowcount, self._rows, self._i = conn, dict_rows, -1, [], 0

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql: str, params: Any = None):
        q = interpolate(sql, params).strip().rstrip(";")
        self.conn._begin()
        head = q.lstrip("( \n").upper()
        try:
            if head.startswith(("SELECT", "WITH")):
                raw = self.conn._psql.run(f"SELECT coalesce(json_agg(row_to_json(_q_)), '[]'::json) FROM ({q}) _q_")
                rows = json.loads(raw, object_pairs_hook=_pairs)
                self._rows = [self._convert(r) for r in rows]
                self.rowcount = len(rows)
            elif head.startswith(("INSERT", "UPDATE", "DELETE")):
                raw = self.conn._psql.run(f"WITH r AS ({q} RETURNING 1) SELECT count(*) FROM r")
                self.rowcount, self._rows = int(raw.strip()), []
            else:
                self.conn._psql.run(q)
                self.rowcount, self._rows = -1, []
        except Error:
            self.conn._failed = True
            raise
        self._i = 0

    def _convert(self, row):
        caster = _casters.get(1114)
        def conv(v):
            if isinstance(v, str) and _TS.match(v):
                return caster.func(v, None) if caster else datetime.fromisoformat(v)   # naive when no caster: like psycopg2
            return _plain(v)
        if self.dict_rows:
            return {k: conv(v) for k, v in row}              # dict: duplicate names collapse, as in psycopg2's RealDictCursor
        return tuple(conv(v) for _, v in row)                # tuple: every column kept, even with duplicate names

    def fetchone(self):
        if self._i >= len(self._rows):
            return None
        self._i += 1
        return self._rows[self._i - 1]

    def fetchall(self):
        rows, self._i = self._rows[self._i:], len(self._rows)
        return rows


class Connection:
    def __init__(self, dsn: str, options: str | None):
        self._psql, self._in_txn, self._failed = _Psql(dsn, options), False, False

    def _begin(self):
        if not self._in_txn:
            self._psql.run("BEGIN")
            self._in_txn = True

    def cursor(self, cursor_factory=None):
        return Cursor(self, dict_rows=cursor_factory is RealDictCursor)

    def commit(self):
        if self._in_txn:
            self._psql.run("ROLLBACK" if self._failed else "COMMIT")
        self._in_txn = self._failed = False

    def rollback(self):
        if self._in_txn:
            self._psql.run("ROLLBACK")
        self._in_txn = self._failed = False

    def close(self):
        if self._in_txn:
            self.rollback()
        self._psql.close()


class RealDictCursor:       # marker, used as `cursor_factory=`
    pass


def connect(dsn: str, options: str | None = None, **_: Any) -> Connection:
    return Connection(dsn, options)


def install() -> None:
    """Register the fake modules (only call when the real psycopg2 can't be imported)."""
    pkg, ext, ex = (types.ModuleType(n) for n in ("psycopg2", "psycopg2.extensions", "psycopg2.extras"))
    pkg.__path__ = []
    pkg.connect, pkg.Error, pkg.ProgrammingError, pkg.extensions, pkg.extras = connect, Error, ProgrammingError, ext, ex
    ext.new_type = lambda oids, name, func: _Type(oids, name, func)
    ext.register_type = lambda t, *_: [_casters.__setitem__(o, t) for o in t.oids] and None
    ex.Json, ex.RealDictCursor = Json, RealDictCursor
    sys.modules.update({"psycopg2": pkg, "psycopg2.extensions": ext, "psycopg2.extras": ex})
