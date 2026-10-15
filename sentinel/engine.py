"""Assertions over an observation. An observation is a plain dict (what a check saw); an assertion is {path, op, value}."""
import re

OPS = {
    "eq": "equals", "ne": "does not equal", "gt": "is more than", "gte": "is at least", "lt": "is less than", "lte": "is at most",
    "between": "is between", "contains": "contains", "matches": "matches the pattern", "in": "is one of", "exists": "exists", "not_exists": "does not exist",
    "is_number": "is a number", "is_text": "is text", "len_gte": "has at least this many items", "len_lte": "has at most this many items",
}
NO_VALUE = ("exists", "not_exists", "is_number", "is_text")
_MISSING = object()


def resolve(obj, path):
    """A small JSONPath: $.a.b, a.b[0].c and [*] (all items). Returns the value, a list for [*], or _MISSING."""
    p = str(path or "").strip()
    if p.startswith("$"):
        p = p[1:]
    cur = [obj]
    multi = False
    for part in re.findall(r"\[\*\]|\[\d+\]|[^.\[\]]+", p):
        nxt = []
        for c in cur:
            if part == "[*]":
                multi = True
                nxt += c if isinstance(c, list) else []
            elif part.startswith("["):
                i = int(part[1:-1])
                if isinstance(c, list) and -len(c) <= i < len(c):
                    nxt.append(c[i])
            elif isinstance(c, dict) and part in c:
                nxt.append(c[part])
        if not nxt:
            return _MISSING
        cur = nxt
    return cur if multi else cur[0]


def _num(v):
    if isinstance(v, bool):
        raise ValueError("not a number")
    return float(v)


def _check(op, actual, expected):
    if op == "exists":
        return actual is not _MISSING
    if op == "not_exists":
        return actual is _MISSING
    if actual is _MISSING:
        return False
    if op == "eq":
        return actual == expected or str(actual).lower() == str(expected).lower()
    if op == "ne":
        return not (actual == expected or str(actual).lower() == str(expected).lower())
    if op in ("gt", "gte", "lt", "lte"):
        a, e = _num(actual), _num(expected)
        return {"gt": a > e, "gte": a >= e, "lt": a < e, "lte": a <= e}[op]
    if op == "between":
        lo, hi = (expected if isinstance(expected, (list, tuple)) else str(expected).split(","))[:2]
        return _num(lo) <= _num(actual) <= _num(hi)
    if op == "contains":
        if isinstance(actual, list):
            return expected in actual or str(expected) in [str(x) for x in actual]
        return str(expected) in str(actual)
    if op == "matches":
        return re.search(str(expected), str(actual)) is not None
    if op == "in":
        opts = expected if isinstance(expected, list) else [x.strip() for x in str(expected).split(",")]
        return actual in opts or str(actual) in [str(o) for o in opts]
    if op == "is_number":
        return isinstance(actual, (int, float)) and not isinstance(actual, bool)
    if op == "is_text":
        return isinstance(actual, str)
    if op == "len_gte":
        return len(actual) >= int(expected)
    if op == "len_lte":
        return len(actual) <= int(expected)
    raise ValueError("unknown operator " + str(op))


def evaluate(obs, a):
    """One assertion against one observation. A path with [*] must hold for every item. Never raises: a bad assertion is reported as an error."""
    op, path, exp = a.get("op"), a.get("path"), a.get("value")
    try:
        actual = resolve(obs, path)
        if isinstance(actual, list) and "[*]" in str(path) and op not in ("len_gte", "len_lte"):
            ok = bool(actual) and all(_check(op, x, exp) for x in actual)
        else:
            ok = _check(op, actual, exp)
        shown = None if actual is _MISSING else (actual if not isinstance(actual, (list, dict)) else f"{type(actual).__name__} of {len(actual)}")
        return {"path": path, "op": op, "expected": exp, "actual": shown, "ok": bool(ok), "error": None}
    except Exception as e:
        return {"path": path, "op": op, "expected": exp, "actual": None, "ok": False, "error": f"{type(e).__name__}: {str(e)[:100]}"}


def run_assertions(obs, assertions):
    results = [evaluate(obs, a) for a in assertions]
    return {"ok": bool(results) and all(r["ok"] for r in results), "results": results}


def describe(a):
    v = a.get("value")
    return f"{a.get('path')} {OPS.get(a.get('op'), a.get('op'))}" + ("" if a.get("op") in NO_VALUE else f" {v}")
