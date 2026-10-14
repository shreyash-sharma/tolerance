"""Check the Gemma fallback on Fireworks. Reads FIREWORKS_API_KEY from the environment or .env (the key is never printed).
  python tools/fireworks_check.py            list the Gemma models your key can call
  python tools/fireworks_check.py --try MODEL   send one small JSON request to MODEL and print the answer"""
import json, os, sys
import httpx

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(root, ".env"))
except Exception:
    pass
key = os.environ.get("FIREWORKS_API_KEY")
if not key:
    sys.exit("FIREWORKS_API_KEY is not set. Add it to .env (one line: FIREWORKS_API_KEY=...). Do not paste it in chat.")
H = {"Authorization": "Bearer " + key}
if "--try" in sys.argv:
    model = sys.argv[sys.argv.index("--try") + 1]
    r = httpx.post("https://api.fireworks.ai/inference/v1/chat/completions", headers=H, timeout=60,
                   json={"model": model, "temperature": 0, "response_format": {"type": "json_object"},
                         "messages": [{"role": "system", "content": "Reply as JSON: {\"ok\": true, \"says\": \"one short sentence about a factory\"}"}, {"role": "user", "content": "hello"}]})
    print(r.status_code, r.text[:600])
else:
    r = httpx.get("https://api.fireworks.ai/inference/v1/models", headers=H, timeout=30)
    r.raise_for_status()
    ids = [m["id"] for m in r.json().get("data", [])]
    gem = [i for i in ids if "gemma" in i.lower()]
    print(f"{len(ids)} models visible to this key; {len(gem)} Gemma:")
    for i in gem:
        print("  ", i)
    if not gem:
        print("No Gemma model is listed for serverless use. Gemma may need a dedicated deployment on Fireworks.")
