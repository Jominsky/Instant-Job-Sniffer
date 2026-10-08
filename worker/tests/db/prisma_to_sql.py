"""Generate PostgreSQL DDL from prisma/schema.prisma (TEST FIXTURE ONLY).

Lets the worker's SQL be exercised against a real Postgres without the Prisma CLI. It follows Prisma's conventions
(table = model name, TEXT/INTEGER/BOOLEAN/TIMESTAMP(3)/JSONB, native enums, `now()` -> CURRENT_TIMESTAMP, client-side
`cuid()`/`@updatedAt` produce NO database default, scalar lists are nullable arrays) but it is NOT the project's migration:
use `prisma migrate dev` for that. Usage: python prisma_to_sql.py ../../../prisma/schema.prisma > schema.sql
"""
from __future__ import annotations
import re
import sys

SCALARS = {"String": "TEXT", "Int": "INTEGER", "Boolean": "BOOLEAN", "DateTime": "TIMESTAMP(3)", "Json": "JSONB", "Float": "DOUBLE PRECISION"}


def _attrs(s: str) -> list[tuple[str, str]]:
    """Parse '@name(args) @other' with balanced parentheses."""
    out, i = [], 0
    while True:
        i = s.find("@", i)
        if i < 0:
            return out
        j = i + 1
        while j < len(s) and (s[j].isalnum() or s[j] in "_@"):
            j += 1
        name, args = s[i:j].lstrip("@"), ""   # (prefix re-added below: "@" field-level, "@@" model-level)
        if j < len(s) and s[j] == "(":
            depth, k = 0, j
            while k < len(s):
                depth += s[k] == "("
                depth -= s[k] == ")"
                k += 1
                if depth == 0:
                    break
            args, j = s[j + 1:k - 1], k
        out.append((("@@" if s[i + 1:i + 2] == "@" else "") + name, args))
        i = j


def _names(args: str) -> list[str]:
    m = re.search(r"\[([^\]]*)\]", args)
    return [x.strip() for x in m.group(1).split(",") if x.strip()] if m else []


def parse(text: str):
    text = re.sub(r"//[^\n]*", "", text)
    enums = {m.group(1): m.group(2).split() for m in re.finditer(r"\benum\s+(\w+)\s*\{([^}]*)\}", text)}
    models: dict[str, dict] = {}
    for m in re.finditer(r"\bmodel\s+(\w+)\s*\{([^}]*)\}", text):
        fields, mattrs = [], []
        for line in m.group(2).splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("@@"):
                mattrs += _attrs(line)
                continue
            fm = re.match(r"(\w+)\s+(\w+)(\[\]|\?)?\s*(.*)$", line)
            if fm:
                fields.append({"name": fm.group(1), "type": fm.group(2), "mod": fm.group(3) or "", "attrs": _attrs(fm.group(4))})
        models[m.group(1)] = {"fields": fields, "attrs": mattrs}
    return enums, models


def _default(raw: str, ftype: str, is_list: bool, enums: dict) -> str | None:
    raw = raw.strip()
    if raw in ("cuid()", "uuid()", "autoincrement()"):
        return None                      # client-side in Prisma: no DB default
    if raw == "now()":
        return "CURRENT_TIMESTAMP"
    if raw == "[]":
        return f'ARRAY[]::{SCALARS.get(ftype) or chr(34) + ftype + chr(34)}[]'
    if raw in ("true", "false"):
        return raw.upper()
    if re.fullmatch(r"-?\d+(\.\d+)?", raw):
        return raw
    if raw.startswith('"'):
        return "'" + raw[1:-1].replace("'", "''") + "'"
    if ftype in enums:
        return f"'{raw}'"
    raise ValueError(f"unsupported default {raw!r}")


def generate(schema_text: str) -> str:
    enums, models = parse(schema_text)
    out = [f'CREATE TYPE "{e}" AS ENUM ({", ".join(repr(v) for v in vals)});' for e, vals in enums.items()]
    fks, idx = [], []
    for mname, m in models.items():
        cols, pk = [], None
        for f in m["fields"]:
            t, mod, attrs = f["type"], f["mod"], dict(f["attrs"])
            if t not in SCALARS and t not in enums:     # relation field
                if "relation" in attrs and "fields:" in attrs["relation"]:
                    ref = re.search(r"references:\s*\[([^\]]*)\]", attrs["relation"]).group(1).split(",")
                    local = _names(re.search(r"fields:\s*(\[[^\]]*\])", attrs["relation"]).group(1))
                    od = re.search(r"onDelete:\s*(\w+)", attrs["relation"])
                    action = {"Cascade": "CASCADE", "SetNull": "SET NULL", "Restrict": "RESTRICT", "NoAction": "NO ACTION"}[od.group(1)] if od else ("SET NULL" if mod == "?" else "RESTRICT")
                    fks.append(f'ALTER TABLE "{mname}" ADD CONSTRAINT "{mname}_{"_".join(local)}_fkey" FOREIGN KEY ({", ".join(chr(34)+c+chr(34) for c in local)}) '
                               f'REFERENCES "{t}"({", ".join(chr(34)+c.strip()+chr(34) for c in ref)}) ON DELETE {action} ON UPDATE CASCADE;')
                continue
            is_list = mod == "[]"
            sql_t = "TEXT" if "db.Text" in attrs else SCALARS.get(t, f'"{t}"')
            col = f'"{f["name"]}" {sql_t}{"[]" if is_list else ""}'
            if not is_list and mod != "?":
                col += " NOT NULL"
            if "default" in attrs:
                d = _default(attrs["default"], t, is_list, enums)
                if d is not None:
                    col += f" DEFAULT {d}"
            if "id" in attrs:
                pk = f["name"]
            if "unique" in attrs:
                idx.append(f'CREATE UNIQUE INDEX "{mname}_{f["name"]}_key" ON "{mname}"("{f["name"]}");')
            cols.append(col)
        cols.append(f'CONSTRAINT "{mname}_pkey" PRIMARY KEY ("{pk}")')
        out.append(f'CREATE TABLE "{mname}" (\n  ' + ",\n  ".join(cols) + "\n);")
        for name, args in m["attrs"]:
            names = _names(args)
            if name == "@@unique":
                idx.append(f'CREATE UNIQUE INDEX "{mname}_{"_".join(names)}_key" ON "{mname}"({", ".join(chr(34)+n+chr(34) for n in names)});')
            elif name == "@@index":
                idx.append(f'CREATE INDEX "{mname}_{"_".join(names)}_idx" ON "{mname}"({", ".join(chr(34)+n+chr(34) for n in names)});')
    return "\n\n".join(out + idx + fks) + "\n"


if __name__ == "__main__":
    sys.stdout.write(generate(open(sys.argv[1]).read()))
