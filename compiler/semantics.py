"""Semantic reconstruction: name what discovered things are. Gemini does it when a key is present; otherwise a transparent
rule-based fallback runs and the result is labelled as such. The graph never depends on this step for its structure."""
import json, os, re

_CACHE = {}
TOKENS = [("PCB", ("pcb", "board")), ("BATTERY_PACK", ("pack",)), ("VIN", ("vin",)), ("BMS", ("bms",)), ("MANUFACTURING_ORDER", ("mo",)), ("TELEMETRY_DEVICE", ("telemetry_device", "device", "tdev"))]


def offline_names(entities):
    out = []
    for en in entities:
        label = "UNKNOWN"
        low = " ".join(f.lower() for f in en["fields"])
        for name, toks in TOKENS:
            if any(re.search(r"(^|[._])" + t + r"|" + t, low) for t in toks):
                label = name
                break
        out.append(label)
    return out


def gemini_names(entities, client, model):
    from google.genai import types
    prompt = ("You are naming real-world entity classes in a factory data estate. Each item lists fields from different systems that hold "
              "the same identifier, with an example value. Answer with a JSON array of short UPPER_SNAKE_CASE class names, one per item, same order.\n"
              + json.dumps([{"fields": e["fields"], "example": e["example"]} for e in entities]))
    from fabric.agents import gen_with_retry
    r = gen_with_retry(client, tries=3, max_wait=8, model=model, contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0))
    names = json.loads(r.text)
    if not (isinstance(names, list) and len(names) == len(entities)):
        raise ValueError("unexpected response shape")
    return names


def make_namer():
    """Returns (namer, mode). Mode is 'gemini' or 'offline-rules'."""
    from fabric.agents import gemini_available, make_client
    if gemini_available():
        try:
            client = make_client()
            model = os.environ.get("TOLERANCE_NAMING_MODEL") or "gemini-3.1-flash-lite"

            def namer(ens):
                key = json.dumps([e["fields"] for e in ens], sort_keys=True)
                if key in _CACHE:  # the same estate names the same way; do not pay for it twice
                    return _CACHE[key]
                try:
                    names = gemini_names(ens, client, model)
                    _CACHE[key] = names
                    return names
                except Exception as e:  # fall back openly, never silently
                    namer.error = f"{type(e).__name__}: {e}"
                    return offline_names(ens)
            namer.error = None
            return namer, "gemini"
        except Exception:
            pass
    return offline_names, "offline-rules"
