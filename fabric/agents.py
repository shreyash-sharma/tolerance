"""RCA agents. Two interchangeable reasoners share one tool gateway:

  GeminiAgent   Gemini with function calling. It chooses and sequences tools, reads the evidence and writes the hypothesis.
  RuleAgent     a deterministic investigator. It exists so the system runs, and can be benchmarked, without a model.

Both start from a strategy (which layer to look at first) chosen by SAGE, and both only act through the Gateway."""
import json, os, re, time

STRATEGIES = {
    "scan_first": ["station", "trace", "erp"],
    "trace_first": ["trace", "station", "erp"],
    "erp_first": ["erp", "trace", "station"],
}
FUNCTIONS = ["fn-ingest-scan", "fn-build-genealogy", "fn-erp-sync", "fn-telemetry"]


def classify(f):
    """Deterministic reading of collected evidence. Returns (class, component, evidence, explanation) or None."""
    e = f.get("trace_errors", {})
    if "fn-ingest-scan" in e:
        ex = e["fn-ingest-scan"]
        return ("INGEST_TRANSFORM_FAILURE", "fn-ingest-scan", [f"trace: {ex}"] + ([f"dead letters: {f['dead']} messages on scan-events"] if f.get("dead") else []),
                "The physical scans were acknowledged and published. The ingestion function failed to transform them, so the records never reached the data store and the genealogy chain could not be built.")
    if "fn-erp-sync" in e:
        return ("ERP_SYNC_FAILURE", "fn-erp-sync", [f"trace: {e['fn-erp-sync']}"], "Genealogy was built and stored, but the call to the ERP failed, so the order never received it.")
    if f.get("skips"):
        return ("GENEALOGY_JOIN_GAP", "fn-build-genealogy", [f"trace: {f['skips']} skipped builds ('chain incomplete')"],
                "No function failed. The genealogy builder found the vehicle record before its pack record, skipped it, and nothing retried it.")
    if f.get("no_scan_for_missing") and (f.get("trace_checked") or f.get("pipeline_clear")):
        return ("STATION_SCAN_FAILURE", "ST-EOL-03", [f"data: no end-of-line scan record exists for {f['no_scan_for_missing']} vehicles"],
                "The pipeline is healthy; the vehicles never produced an end-of-line record. The fault is at the station, before the software saw anything.")
    return None


class RuleAgent:
    name = "rule-based investigator"

    def __init__(self, gw, alert, order=None):
        self.gw, self.alert, self.f = gw, alert, {"trace_checked": False}
        self.order = order or STRATEGIES["trace_first"]

    def _call(self, tool, args):
        return self.gw.call("rca", tool, args)

    def probe_station(self):
        miss = self.alert["missing_vins"]
        none = 0
        for v in miss[:2]:
            r = self._call("query_collection", {"collection": "scans", "filter": {"type": "vehicle_assembly", "vin": v}})
            none += 0 if (r.get("ok") and r["result"]) else 1
        self._call("opcua_read", {"node": "ST-EOL-03"})
        self.probe_physical()
        if none == len(miss[:2]):
            self.f["no_scan_for_missing"] = len(miss)
            d = self._call("dead_letters", {"queue": "scan-events"})
            if d.get("ok") and not d["result"]:
                self.f["pipeline_clear"] = True

    def probe_physical(self):
        ph = self._call("physical_state", {"hours": 6})
        if ph.get("ok") and isinstance(ph["result"], dict) and "any_failure_in_window" in ph["result"]:
            self.f["physical"] = "no machine failure in the last 6 log-hours (machine state data)" if not ph["result"]["any_failure_in_window"] else "a machine failure occurred in the last 6 log-hours (machine state data)"

    def probe_trace(self):
        for svc in FUNCTIONS:
            r = self._call("read_traces", {"service": svc, "status": "ERROR", "limit": 20})
            if r.get("ok") and r["result"]:
                ev = r["result"][-1]["events"]
                self.f.setdefault("trace_errors", {})[svc] = (ev[0]["message"] if ev else "error")
                if svc == "fn-ingest-scan":
                    d = self._call("dead_letters", {"queue": "scan-events"})
                    self.f["dead"] = len(d["result"]) if d.get("ok") else 0
                break
            if svc == "fn-build-genealogy":
                s = self._call("read_traces", {"service": svc, "limit": 400})
                skips = sum(1 for x in (s["result"] if s.get("ok") else []) if x["name"] == "skip")
                if skips:
                    self.f["skips"] = skips
                    break
        self.f["trace_checked"] = True

    def probe_erp(self):
        mo = self.alert.get("mos", {}).get(self.alert["missing_vins"][0])
        if mo:
            r = self._call("erp_get_order", {"mo": mo})
            if r.get("ok"):
                self.f["erp"] = r["result"].get("genealogy_status")

    def run(self):
        t0 = len(self.gw.audit)
        steps = []
        for p in self.order:
            getattr(self, "probe_" + p)()
            steps.append(p)
            c = classify(self.f)
            if c:
                break
        if "physical" not in self.f:
            self.probe_physical()  # always rule the physical layer in or out with the real machine data
        c = c or ("UNKNOWN", "unknown", [], "Evidence did not support a diagnosis.")
        if self.f.get("physical"):
            c = (c[0], c[1], list(c[2]) + ["physical layer: " + self.f["physical"]], c[3])
        calls = len(self.gw.audit) - t0
        return {"class": c[0], "component": c[1], "evidence": c[2], "explanation": c[3], "affected": self.alert["missing_vins"], "calls": calls,
                "steps": steps, "agent": self.name, "confidence": 0.9 if c[0] != "UNKNOWN" else 0.1}


# ------------------------------------------------------------------ Gemini
def gemini_available():
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true"))


def make_client():
    """Gemini client. On Cloud Run set GOOGLE_GENAI_USE_VERTEXAI=true (plus GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION) to use Vertex AI with the service account;
    anywhere else a GEMINI_API_KEY is used."""
    from google import genai
    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true"):
        return genai.Client(vertexai=True, project=os.environ.get("GOOGLE_CLOUD_PROJECT"), location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"))
    return genai.Client(api_key=os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


SYSTEM = """You are the RCA agent inside Tolerance, an industrial intelligence layer. A factory has a data and software estate: stations, queues,
functions, a document store and an ERP API. You may only investigate through the tools you are given. You cannot change anything; a person and a
deterministic gate control every change. Be economical: each tool call has a cost. Never claim a cause the evidence does not show.
Finish by calling the function `final_hypothesis` with the root cause class (one of INGEST_TRANSFORM_FAILURE, ERP_SYNC_FAILURE, GENEALOGY_JOIN_GAP,
STATION_SCAN_FAILURE, UNKNOWN), the component, the evidence strings you actually saw, a short explanation and a confidence between 0 and 1."""


def gemini_tool_decls(types, tool_names, registry):
    decls = []
    for n in tool_names:
        t = registry[n]
        props = {k: types.Schema(type={"string": "STRING", "object": "OBJECT", "integer": "INTEGER"}[v]) for k, v in t["params"].items()}
        decls.append(types.FunctionDeclaration(name=n, description=t["doc"], parameters=types.Schema(type="OBJECT", properties=props)))
    decls.append(types.FunctionDeclaration(name="final_hypothesis", description="Submit the final root cause hypothesis and stop.", parameters=types.Schema(
        type="OBJECT", properties={"root_cause_class": types.Schema(type="STRING"), "component": types.Schema(type="STRING"),
                                   "evidence": types.Schema(type="ARRAY", items=types.Schema(type="STRING")), "explanation": types.Schema(type="STRING"),
                                   "confidence": types.Schema(type="NUMBER")}, required=["root_cause_class", "component", "evidence", "explanation", "confidence"])))
    return decls


MODEL_POOL = [m for m in (os.environ.get("TOLERANCE_MODELS") or "gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-3-flash-preview,gemini-flash-latest,gemini-2.5-flash").split(",") if m]
_dead = {}  # model -> time until which it is considered exhausted


def pick_model(preferred=None):
    now = time.time()
    order = ([preferred] if preferred else []) + [m for m in MODEL_POOL if m != preferred]
    for m in order:
        if _dead.get(m, 0) < now:
            return m
    return order[0]


_DAY = {"day": None, "n": 0}


def count_call():
    """A daily cap on Gemini calls (GEMINI_DAILY_CAP, default 1500) so a demo can never run up a bill. Past the cap, callers fall back to their rules or recordings."""
    today = time.strftime("%Y-%m-%d", time.gmtime())
    if _DAY["day"] != today:
        _DAY.update(day=today, n=0)
    cap = int(os.environ.get("GEMINI_DAILY_CAP", "1500"))
    if _DAY["n"] >= cap:
        raise RuntimeError(f"demo quota reached: {cap} Gemini calls today")
    _DAY["n"] += 1
    try:   # the per-visitor quota (cloud only: the single-user mode is "local")
        from workspace import store
        uid = store.UID.get()
        if uid != "local":
            from server import quota
            quota.charge_gemini(uid)
    except ImportError:
        pass
    return _DAY["n"]


def calls_today():
    return dict(_DAY, cap=int(os.environ.get("GEMINI_DAILY_CAP", "1500")))


def gen_with_retry(client, tries=6, max_wait=65, **kw):
    """generate_content with backoff, and rotation across models when one runs out of quota (each model has its own quota on a free key)."""
    count_call()
    kw["model"] = pick_model(kw.get("model") if kw.get("model") in MODEL_POOL else None) if kw.get("model") in (None, "auto") else kw["model"]
    for i in range(tries):
        try:
            return client.models.generate_content(**kw)
        except Exception as e:
            msg = str(e)
            quota = "429" in msg or "RESOURCE_EXHAUSTED" in msg
            if quota or "503" in msg or "UNAVAILABLE" in msg:
                m = re.search(r"retry in ([0-9.]+)s", msg)
                wait = float(m.group(1)) + 1 if m else 8 * (i + 1)
                if quota:
                    _dead[kw["model"]] = time.time() + (wait if wait < 120 else 3600)
                    alive = [m for m in MODEL_POOL if _dead.get(m, 0) < time.time()]
                    if alive:
                        kw["model"] = alive[0]
                        continue
                    raise  # every model is out of quota: fail fast so callers can fall back instead of stalling the demo
                if i < tries - 1:
                    time.sleep(min(max_wait, wait))
                    continue
            raise


class GeminiAgent:
    name = "Gemini"

    def __init__(self, gw, alert, strategy="trace_first", client=None, model=None, max_turns=12, on_step=None, context="", max_seconds=45):
        from google.genai import types
        from fabric.gateway import TOOLS
        self.gw, self.alert, self.strategy, self.max_turns, self.on_step, self.context, self.max_seconds = gw, alert, strategy, max_turns, on_step, context, max_seconds
        self.types = types
        self.client = client or make_client()
        self.model = model or os.environ.get("TOLERANCE_MODEL") or "auto"
        self.tools = [n for n in TOOLS if n not in ("replay_to_replica", "propose_plan", "apply_to_production")]  # write is visible so a denial can be shown
        self.registry = TOOLS

    def run(self):
        t, types = time.time(), self.types
        t0 = len(self.gw.audit)
        hint = {"scan_first": "Start at the station and physical records.", "trace_first": "Start with the function traces and dead letters.", "erp_first": "Start by checking the ERP orders."}[self.strategy]
        user = (f"ALERT: {self.alert['title']}. Missing VINs (first 6): {self.alert['missing_vins'][:6]}. Manufacturing orders: " +
                json.dumps({v: self.alert.get('mos', {}).get(v) for v in self.alert['missing_vins'][:3]}) + f"\nStrategy hint from the adaptive selector: {hint}")
        contents = [types.Content(role="user", parts=[types.Part(text=user)])]
        cfg = types.GenerateContentConfig(system_instruction=SYSTEM + ("\n\n" + self.context if self.context else ""), tools=[types.Tool(function_declarations=gemini_tool_decls(types, self.tools, self.registry))],
                                          temperature=0, automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
        steps, final = [], None
        self.used = None
        for _ in range(self.max_turns):
            if time.time() - t > self.max_seconds:
                raise TimeoutError(f"Gemini investigation exceeded {self.max_seconds}s")
            resp = gen_with_retry(self.client, tries=4, max_wait=8, model=self.model, contents=contents, config=cfg)
            self.used = getattr(resp, 'model_version', None) or self.used
            cand = resp.candidates[0].content
            contents.append(cand)
            calls = [p.function_call for p in cand.parts if getattr(p, "function_call", None)]
            if not calls:
                break
            parts = []
            for fc in calls:
                args = dict(fc.args or {})
                if fc.name == "final_hypothesis":
                    final = args
                    parts.append(types.Part.from_function_response(name=fc.name, response={"ok": True}))
                    continue
                out = self.gw.call("rca", fc.name, args)
                steps.append({"tool": fc.name, "args": args, "ok": out.get("ok"), "denied": out.get("denied")})
                if self.on_step:
                    self.on_step(steps[-1])
                payload = json.loads(json.dumps(out, default=str))
                s = json.dumps(payload)
                if len(s) > 6000:
                    payload = {"ok": payload.get("ok"), "truncated": True, "preview": s[:6000]}
                parts.append(types.Part.from_function_response(name=fc.name, response=payload))
            contents.append(types.Content(role="user", parts=parts))
            if final:
                break
        final = final or {"root_cause_class": "UNKNOWN", "component": "unknown", "evidence": [], "explanation": "no hypothesis produced", "confidence": 0.1}
        return {"class": final["root_cause_class"], "component": final["component"], "evidence": list(final["evidence"]), "explanation": final["explanation"],
                "affected": self.alert["missing_vins"], "calls": len(self.gw.audit) - t0, "steps": [s["tool"] for s in steps], "agent": f"Gemini ({self.used or self.model})",
                "confidence": float(final["confidence"]), "latency_s": round(time.time() - t, 2)}
