"""Score the compiled graph against sealed ground truth. Honest numbers: precision, recall, trap handling."""
import itertools
from plant.topology import TRUE_EDGES, TRUE_IDENTITY, TRAPS


def prf(tp, fp, fn):
    p = tp / max(1, tp + fp)
    r = tp / max(1, tp + fn)
    return {"precision": round(p, 3), "recall": round(r, 3), "f1": round(2 * p * r / max(1e-9, p + r), 3), "tp": tp, "fp": fp, "fn": fn}


def score(oir):
    got = {(e["src"], e["dst"], e["type"]) for e in oir["spec"]["edges"]}
    edge = prf(len(got & TRUE_EDGES), len(got - TRUE_EDGES), len(TRUE_EDGES - got))
    # identity: pairs of fields resolved into the same entity
    def pairs(groups):
        out = set()
        for g in groups:
            out |= {tuple(sorted(p)) for p in itertools.combinations(sorted(g), 2)}
        return out
    truth = pairs(TRUE_IDENTITY.values())
    found = pairs([set(en["fields"]) for en in oir["entities"]])
    ident = prf(len(found & truth), len(found - truth), len(truth - found))
    stale = TRAPS["stale_manifest"]
    traps = {
        "stale_manifest_rejected": stale not in got and any(u["kind"] == "declared_not_observed" and "scans_v2" in u["subject"] for u in oir["uncertainty"]),
        "ambiguous_field_withheld": not any(TRAPS["ambiguous_field"] in en["fields"] for en in oir["entities"]) and any(u["kind"] == "ambiguous_identifier" and u["subject"] == TRAPS["ambiguous_field"] for u in oir["uncertainty"]),
    }
    return {"edges": edge, "identity": ident, "traps": traps, "missed_edges": sorted(map(list, TRUE_EDGES - got)), "false_edges": sorted(map(list, got - TRUE_EDGES))}
