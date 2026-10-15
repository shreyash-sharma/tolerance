"""Unit tests for Sentinel's rule engine and its address guard. Run:  python tests/sentinel_test.py"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sentinel import engine as E, guard

OBS = {"status": 200, "latency_ms": 120, "rows": 10, "json": {"items": [{"price": 3}, {"price": 7}], "name": "plant"}, "tags": ["a", "b"]}
CASES = [
    ({"path": "status", "op": "eq", "value": 200}, True),
    ({"path": "$.status", "op": "eq", "value": "200"}, True),
    ({"path": "latency_ms", "op": "lt", "value": 500}, True),
    ({"path": "latency_ms", "op": "lt", "value": 100}, False),
    ({"path": "rows", "op": "between", "value": "5,15"}, True),
    ({"path": "$.json.items[*].price", "op": "lt", "value": 9}, True),
    ({"path": "$.json.items[*].price", "op": "lt", "value": 5}, False),
    ({"path": "$.json.items", "op": "len_gte", "value": 2}, True),
    ({"path": "$.json.items[1].price", "op": "eq", "value": 7}, True),
    ({"path": "json.name", "op": "matches", "value": "^pla"}, True),
    ({"path": "tags", "op": "contains", "value": "b"}, True),
    ({"path": "status", "op": "in", "value": "200, 204"}, True),
    ({"path": "missing", "op": "exists"}, False),
    ({"path": "missing", "op": "not_exists"}, True),
    ({"path": "status", "op": "is_number"}, True),
    ({"path": "json.name", "op": "is_text"}, True),
    ({"path": "json.name", "op": "gt", "value": 3}, False),   # a text value is not a number: reported as a failed check, not a crash
]


def main():
    bad = 0
    for a, want in CASES:
        r = E.evaluate(OBS, a)
        if r["ok"] != want:
            bad += 1
            print("FAIL", a, "->", r)
    r = E.run_assertions(OBS, [CASES[0][0], CASES[3][0]])
    if r["ok"]:
        bad += 1
        print("FAIL: one failing assertion must fail the rule")
    if E.run_assertions(OBS, [])["ok"]:
        bad += 1
        print("FAIL: a rule with no assertions must not pass")
    for url in ("http://127.0.0.1/x", "https://localhost/x", "http://169.254.169.254/latest", "ftp://example.com/x"):
        try:
            guard.check_url(url)
            bad += 1
            print("FAIL: guard let through", url)
        except guard.Refused:
            pass
    print("sentinel tests:", "all passed" if not bad else f"{bad} failed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
