"""The owner's own MCP servers: connect to one over HTTP (streamable HTTP first, then SSE), list its tools, and call them later.
They join the same hub as the built-in servers, so every call an agent makes still passes the policy gateway: a tool the server marks read-only may be read, anything else is denied
until a policy permits it. The token for a server sits in the vault. Servers are kept per visitor."""
import asyncio, json, re, time

from workspace import store, vault


SAFE_NAME = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")   # tool names go into policy text, so odd ones are dropped


def _tools(res):
    return [{"name": t.name, "description": (t.description or "").strip()[:300], "schema": t.inputSchema, "read_only": bool(t.annotations and t.annotations.readOnlyHint)} for t in res.tools if SAFE_NAME.match(t.name)]


async def _session(url, token, transport, fn):
    from mcp import ClientSession
    headers = {"Authorization": "Bearer " + token} if token else {}
    if transport == "sse":
        from mcp.client.sse import sse_client
        async with sse_client(url, headers=headers, timeout=10, sse_read_timeout=60) as (r, w):
            async with ClientSession(r, w) as s:
                await s.initialize()
                return await fn(s)
    from mcp.client.streamable_http import streamablehttp_client
    async with streamablehttp_client(url, headers=headers, timeout=10) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            return await fn(s)


def _run(url, token, fn, transport=None, timeout=25):
    """Runs one session. With no transport named, streamable HTTP is tried first and SSE second (an address ending in /sse starts with SSE)."""
    order = [transport] if transport else (["sse", "streamable"] if url.rstrip("/").endswith("/sse") else ["streamable", "sse"])
    err = None
    for tr in order:
        try:
            return tr, asyncio.run(asyncio.wait_for(_session(url, token, tr, fn), timeout))
        except Exception as e:   # try the other transport
            err = e
    raise RuntimeError(f"{type(err).__name__}: {str(err)[:200]}")


def list_tools(url, token="", transport=None):
    """Connect and list the tools. Returns (transport, tools)."""
    async def fn(s):
        return _tools(await s.list_tools())
    from sentinel.guard import check_url
    check_url(url)
    return _run(url, token, fn, transport)


def add(name, url, token="", quote=""):
    """Connect, keep the server (with its tools) for this visitor, and return it."""
    tr, tools = list_tools(url, token)
    ref = vault.put(token) if token else None
    rec = {"id": store.new_id("mcp"), "name": (name or "MCP server")[:120], "url": url, "transport": tr, "secret_ref": ref, "quote": (quote or "")[:300], "tools": tools, "at": time.time()}

    def f(d):
        d["mcp_remote"] = [x for x in d.get("mcp_remote", []) if x["url"] != url] + [rec]
    store.update(f)
    return public(rec)


def public(rec):
    return {"id": "remote:" + rec["id"], "title": rec["name"], "about": rec.get("quote") or rec["url"], "url": rec["url"], "protocol": "Model Context Protocol", "tools": rec["tools"], "remote": True, "calls": 0}


def servers():
    return [public(r) for r in store.load().get("mcp_remote", [])]


def remove(sid):
    rid = sid.split(":", 1)[-1]

    def f(d):
        keep = []
        for x in d.get("mcp_remote", []):
            if x["id"] == rid:
                vault.drop(x.get("secret_ref") or "")
            else:
                keep.append(x)
        d["mcp_remote"] = keep
    store.update(f)


def get(sid):
    rid = sid.split(":", 1)[-1]
    return next((x for x in store.load().get("mcp_remote", []) if x["id"] == rid), None)


def refresh(sid):
    """Read the server's tools again (it may have new ones)."""
    rec = get(sid)
    if not rec:
        raise KeyError(sid)
    tr, tools = list_tools(rec["url"], vault.get(rec.get("secret_ref")) or "", rec.get("transport"))

    def f(d):
        for x in d.get("mcp_remote", []):
            if x["id"] == rec["id"]:
                x["tools"], x["at"] = tools, time.time()
    store.update(f)
    return tools


def call(sid, tool, args, timeout=40):
    rec = get(sid)
    if not rec:
        raise RuntimeError(f"no MCP server {sid}")

    async def fn(s):
        return await s.call_tool(tool, args or {})
    from sentinel.guard import check_url
    check_url(rec["url"])
    _, res = _run(rec["url"], vault.get(rec.get("secret_ref")) or "", fn, rec.get("transport"), timeout)
    text = "".join(c.text for c in res.content if getattr(c, "type", "") == "text")
    try:
        out = json.loads(text) if text else None
    except Exception:
        out = {"text": text}
    if res.isError:
        raise RuntimeError((out or {}).get("text") if isinstance(out, dict) else text or "tool error")
    return out
