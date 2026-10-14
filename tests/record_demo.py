"""Record live Gemini runs for the demo, so they can be replayed instantly (and labelled as recordings).
Needs a running server with the incident archive attached and a working Gemini key (or Vertex).
Run:  python -m tests.record_demo [n_cases] [base_url]
Then copy data/demo_cache.json to seed/demo_cache.json to ship the recordings."""
import sys, time
import httpx

N = int(sys.argv[1]) if len(sys.argv) > 1 else 8
B = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:48410") + "/api/ws"
c = httpx.Client(timeout=300)
CHATS = ["Which parts of this map are you least sure about?", "Explain what the Online Boutique system looks like in two sentences.", "Which service does the most calling?",
         "Line up WH1, WH2, C1, C2, TR, AGV and Final inspection in that order as a flow."]

c.post(B + "/incidents/scan")
inc = [i for i in c.get(B + "/incidents").json()["incidents"] if i["kind"] == "service" and not i.get("investigation")]
inc.sort(key=lambda i: i["alert"]["feed_id"])
done = 0
for i in inc[:N]:
    rec = c.post(B + f"/incidents/{i['id']}/recommend").json()
    t0 = time.time()
    r = c.post(B + f"/incidents/{i['id']}/investigate", data={"strategy": rec["arm"], "mode": "gemini", "replay": 0})
    if r.status_code != 200:
        print("FAIL", i["title"], r.status_code, r.text[:120])
        continue
    res = r.json()["result"]
    print(f"{i['case']:34} {rec['arm']:14} -> {res.get('service')}  ({res.get('agent')}, {time.time() - t0:.0f}s)")
    done += res.get("agent", "").startswith("Gemini")
for q in CHATS:
    t0 = time.time()
    r = c.post(B + "/chat", data={"message": q, "history": "[]", "replay": 0})
    print("chat:", q[:50], "->", r.status_code, f"{time.time() - t0:.0f}s")
print("recorded Gemini investigations:", done, "| cache entries:", c.get(B + "/demo/cache").json())
