"""Copy the recorded document extractions from data/demo_cache.json (this machine) into seed/demo_cache.json (shipped), so the pack replays without a Gemini key."""
import json, os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
live = json.load(open(os.path.join(root, "data", "demo_cache.json"), encoding="utf8"))
seed_p = os.path.join(root, "seed", "demo_cache.json")
seed = json.load(open(seed_p, encoding="utf8"))
n = 0
for k, v in live.items():
    if k.startswith("doc:") and k not in seed:
        seed[k] = v
        n += 1
json.dump(seed, open(seed_p, "w", encoding="utf8"), default=str)
print(f"copied {n} document recordings; seed now has {len(seed)} entries")
