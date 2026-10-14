"""Gemini for the Foreman agents: JSON answers and tool-using loops, with record and replay.
A run that reaches Gemini is recorded. The next identical run replays the recording (steps visible, labelled "recorded"), so a demo works
when the quota is out or the network is down. Pass live=True to force a live call."""
import concurrent.futures as cf
import hashlib, json, time

from fabric import agents as FA
from workspace import demo_cache as DC


class LLMUnavailable(Exception):
    pass


_POOL = cf.ThreadPoolExecutor(max_workers=8, thread_name_prefix="gemini")


def _bounded(fn, seconds):
    """Run a Gemini call with a hard time limit. A slow or stuck call must never freeze an agent: the caller falls back to its rule-based path."""
    fut = _POOL.submit(fn)
    try:
        return fut.result(timeout=seconds)
    except cf.TimeoutError:
        raise LLMUnavailable(f"Gemini did not answer within {seconds} s")


def available():
    return FA.gemini_available()


def _sha(*parts):
    return hashlib.sha256("\x1f".join(str(p) for p in parts).encode("utf8")).hexdigest()[:24]


# ---------------------------------------------------------------- the ledger and the last-resort fallback
LEDGER = []   # every model call: who asked, which provider and model, live or recorded, how long. Shown on the Proof page.


def _note(agent, provider, model, source, ms, error=None):
    LEDGER.append({"at": time.time(), "agent": agent, "provider": provider, "model": model, "source": source, "ms": ms, "error": (error or None) and str(error)[:240]})
    del LEDGER[:-300]


FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions"


def fallback_configured():
    """Gemma on Fireworks is a last resort for when Gemini does not answer. It runs outside Google Cloud, so it is off unless a key is set,
    and FALLBACK_GEMMA=0 switches it off (the Cloud Run deployment sets that, so the submitted app uses Google only)."""
    import os
    return bool(os.environ.get("FIREWORKS_API_KEY")) and os.environ.get("FALLBACK_GEMMA", "1") != "0"


def _gemma_json(system, user, timeout=30):
    """One JSON answer from Gemma on Fireworks (OpenAI-compatible API). Returns (dict, model)."""
    import os
    import httpx
    model = os.environ.get("FIREWORKS_MODEL", "accounts/fireworks/models/gemma-3-27b-it")
    r = httpx.post(FIREWORKS_URL, timeout=timeout, headers={"Authorization": "Bearer " + os.environ["FIREWORKS_API_KEY"]},
                   json={"model": model, "temperature": 0, "response_format": {"type": "json_object"},
                         "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
    r.raise_for_status()
    txt = r.json()["choices"][0]["message"]["content"]
    txt = txt.strip()
    if txt.startswith("```"):
        txt = txt.strip("`").split(chr(10), 1)[-1].rsplit("```", 1)[0]
    return json.loads(txt), model


def _gemini_json(system, user, tries, timeout):
    from google.genai import types
    client = FA.make_client()
    try:
        resp = _bounded(lambda: FA.gen_with_retry(client, tries=tries, max_wait=6, model="auto", contents=user,
                                                  config=types.GenerateContentConfig(system_instruction=system, response_mime_type="application/json", temperature=0)), timeout)
    except LLMUnavailable:
        raise
    except Exception as e:   # quota, network, overload
        raise LLMUnavailable(f"{type(e).__name__}: {str(e)[:120]}")
    try:
        return json.loads(resp.text), getattr(resp, "model_version", None)
    except Exception:
        raise LLMUnavailable("Gemini returned text that is not JSON")


def ask_json(agent, system, user, run=None, live=False, extra="", tries=3, timeout=35):
    """One structured answer. Returns (dict, source): "gemini", "gemma" (last-resort fallback) or "recorded".
    Order: a recording (unless live=True), then Gemini, then Gemma on Fireworks if configured. If all fail, LLMUnavailable: the caller uses its rules."""
    key = "jig:" + _sha(agent, system, user, extra)
    if not live:
        rec = DC.get(key)
        if rec:
            if run:
                run.step("llm", "replaying a recorded answer", model=rec.get("model"))
            _note(agent, rec.get("provider", "google"), rec.get("model"), "recorded", 0)
            return rec["out"], "recorded"
    t0 = time.time()
    why = "no Gemini key"
    if available():
        try:
            out, model = _gemini_json(system, user, tries, timeout)
            ms = round((time.time() - t0) * 1000)
            if run:
                run.step("llm", "Gemini answered", model=model, seconds=round(ms / 1000, 1))
            _note(agent, "google", model, "live", ms)
            DC.put(key, {"out": out, "model": model, "provider": "google", "at": time.time()})
            return out, "gemini"
        except LLMUnavailable as e:
            why = str(e)
            _note(agent, "google", None, "error", round((time.time() - t0) * 1000), why)
    if fallback_configured():
        t1 = time.time()
        try:
            out, model = _gemma_json(system, user)
            ms = round((time.time() - t1) * 1000)
            if run:
                run.step("llm", "Gemini did not answer; Gemma on Fireworks answered (fallback)", model=model, seconds=round(ms / 1000, 1))
            _note(agent, "fireworks", model, "fallback", ms)
            return out, "gemma"
        except Exception as e:
            why += f"; Gemma fallback failed: {type(e).__name__}: {str(e)[:100]}"
    _note(agent, "none", None, "unavailable", round((time.time() - t0) * 1000))
    raise LLMUnavailable(why)


def mcp_decls(types, tools, hub):
    """Function declarations for MCP tools given as 'server/tool'. Gemini names cannot contain '/', so server__tool is used."""
    decls, names = [], {}
    for full in tools:
        server, _, tool = full.partition("/")
        meta = hub.meta(server, tool)
        if not meta:
            continue
        schema = json.loads(json.dumps(meta["schema"] or {"type": "object", "properties": {}}))
        for k in ("title", "$defs"):
            schema.pop(k, None)
        for p in (schema.get("properties") or {}).values():
            p.pop("title", None)
        n = f"{server}__{tool}"
        names[n] = full
        decls.append(types.FunctionDeclaration(name=n, description=meta["description"][:600], parameters_json_schema=schema))
    return decls, names


def tool_loop(agent, system, user, tools, call, final_decl, run, live=False, max_turns=8, extra="", max_seconds=70):
    """Gemini picks tools and reads their results until it calls the final function.
    call(full_tool_name, args) must go through the policy gateway and return its dict. Returns (final_args, steps, source)."""
    key = "jig:" + _sha(agent, system, user, extra, ",".join(sorted(tools)))
    if not live:
        rec = DC.get(key)
        if rec:
            run.step("llm", "replaying a recorded Gemini investigation", model=rec.get("model"))
            for st in rec["steps"]:
                time.sleep(0.35)
                run.steps.append({**st, "t": round(time.time() - run.t0, 2), "recorded": True})
            return rec["final"], rec["steps"], "recorded"
    if not available():
        raise LLMUnavailable("no Gemini key")
    from google.genai import types
    from mcpx.hub import HUB
    HUB.start()
    decls, names = mcp_decls(types, tools, HUB)
    decls.append(final_decl(types))
    client = FA.make_client()
    cfg = types.GenerateContentConfig(system_instruction=system, tools=[types.Tool(function_declarations=decls)], temperature=0,
                                      automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
    contents = [types.Content(role="user", parts=[types.Part(text=user)])]
    t0, final, model, tool_steps = time.time(), None, None, []
    for _ in range(max_turns):
        if time.time() - t0 > max_seconds:
            raise TimeoutError("Gemini took too long")
        try:
            resp = _bounded(lambda: FA.gen_with_retry(client, tries=4, max_wait=8, model="auto", contents=contents, config=cfg), 40)
        except LLMUnavailable:
            raise
        except Exception as e:
            raise LLMUnavailable(f"{type(e).__name__}: {str(e)[:120]}")
        model = getattr(resp, "model_version", None) or model
        cand = resp.candidates[0].content
        contents.append(cand)
        calls = [p.function_call for p in cand.parts if getattr(p, "function_call", None)]
        for p in cand.parts:
            if getattr(p, "text", None) and p.text.strip():
                run.step("llm", p.text.strip()[:400], model=model)
        if not calls:
            break
        parts = []
        for fc in calls:
            args = json.loads(json.dumps(dict(fc.args or {}), default=lambda o: list(o) if hasattr(o, "__iter__") else str(o)))
            if fc.name == "submit":
                final = args
                parts.append(types.Part.from_function_response(name=fc.name, response={"ok": True}))
                continue
            full = names.get(fc.name)
            if not full:
                parts.append(types.Part.from_function_response(name=fc.name, response={"error": "unknown tool"}))
                continue
            out = call(full, args)
            summary = (out.get("reason") or out.get("error") or json.dumps(out.get("result"), default=str)[:240]) if isinstance(out, dict) else str(out)[:240]
            st = run.step("tool", full, args=args, decision="DENY" if out.get("denied") else "ALLOW", result=summary)
            tool_steps.append(st)
            payload = out.get("result") if out.get("ok") else {"error": out.get("reason") or out.get("error")}
            data = json.loads(json.dumps(payload, default=str))
            parts.append(types.Part.from_function_response(name=fc.name, response={"result": data}))
        contents.append(types.Content(role="user", parts=parts))
        if final is not None:
            break
    if final is None:
        raise LLMUnavailable("Gemini did not submit an answer")
    DC.put(key, {"final": final, "steps": tool_steps, "model": model, "at": time.time()})
    return final, tool_steps, "gemini"
