"""The MCP hub: connects to the plant's MCP servers over the Model Context Protocol, lists their tools, and lets the rest of the app call them.
Servers run in-process over an in-memory MCP transport (no subprocess, no file-lock conflicts); the same server objects can be exposed over stdio or HTTP for outside clients.
Every call an agent makes is authorised by the policy gateway before it reaches the hub."""
import asyncio, json, threading, time

from mcp.shared.memory import create_connected_server_and_client_session

from mcpx import servers as _srv
from mcpx.servers import SERVERS

LOG = []  # recent calls, newest last
_lock = threading.Lock()
_call_lock = threading.RLock()


class Hub:
    def __init__(self):
        self.loop = None
        self.thread = None
        self.sessions = {}
        self.tools = {}
        self.ready = threading.Event()
        self.error = None

    # -------------------------------------------------- lifecycle
    def start(self):
        with _lock:
            if self.thread:
                return
            self.thread = threading.Thread(target=self._run, daemon=True, name="mcp-hub")
            self.thread.start()
        self.ready.wait(60)

    def _run(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._boot())

    async def _boot(self):
        from contextlib import AsyncExitStack
        try:
            async with AsyncExitStack() as stack:
                for name, (srv, title, about) in SERVERS.items():
                    sess = await stack.enter_async_context(create_connected_server_and_client_session(srv._mcp_server))
                    self.sessions[name] = sess
                    res = await sess.list_tools()
                    self.tools[name] = [{"name": t.name, "description": (t.description or "").strip(), "schema": t.inputSchema, "read_only": bool(t.annotations and t.annotations.readOnlyHint)} for t in res.tools]
                self.ready.set()
                await asyncio.Event().wait()
        except Exception as e:  # keep the app up; the UI shows the error
            self.error = f"{type(e).__name__}: {e}"
            self.ready.set()

    # -------------------------------------------------- queries
    def servers(self):
        self.start()
        from mcpx import remote as _rm
        return self._builtin() + _rm.servers()

    def _builtin(self):
        return [{"id": n, "title": SERVERS[n][1], "about": SERVERS[n][2], "protocol": "Model Context Protocol", "tools": self.tools.get(n, []),
                 "calls": sum(1 for c in LOG if c["server"] == n)} for n in SERVERS]

    def meta(self, server, tool):
        self.start()
        if server.startswith("remote:"):
            from mcpx import remote as _rm
            rec = _rm.get(server)
            return next((t for t in (rec or {}).get("tools", []) if t["name"] == tool), None)
        return next((t for t in self.tools.get(server, []) if t["name"] == tool), None)

    def read_only_tools(self):
        self.start()
        from mcpx import remote as _rm
        rem = [(sv["id"], t["name"]) for sv in _rm.servers() for t in sv["tools"] if t["read_only"]]
        return [(n, t["name"]) for n, ts in self.tools.items() for t in ts if t["read_only"]] + rem

    # -------------------------------------------------- calls
    def call(self, server, tool, args=None, timeout=90, who="agent"):
        self.start()
        if server.startswith("remote:"):
            from mcpx import remote as _rm
            t0 = time.time()
            ok = True
            try:
                return _rm.call(server, tool, args or {}, timeout)
            except Exception:
                ok = False
                raise
            finally:
                LOG.append({"t": round(time.time(), 2), "server": server, "tool": tool, "args": args or {}, "ok": ok, "ms": round((time.time() - t0) * 1000), "who": who})
                del LOG[:-200]
        if server not in self.sessions:
            raise RuntimeError(self.error or f"no MCP server {server}")
        t0 = time.time()
        from workspace import store
        with _call_lock:   # one call at a time, so the visitor set for the tools is the visitor who asked
            _srv.CUR_UID["uid"] = store.UID.get()
            fut = asyncio.run_coroutine_threadsafe(self.sessions[server].call_tool(tool, args or {}), self.loop)
            res = fut.result(timeout=timeout)
        text = "".join(c.text for c in res.content if getattr(c, "type", "") == "text")
        try:
            out = json.loads(text) if text else None
        except Exception:
            out = {"text": text}
        ok = not res.isError
        LOG.append({"t": round(time.time(), 2), "server": server, "tool": tool, "args": args or {}, "ok": ok, "ms": round((time.time() - t0) * 1000), "who": who})
        del LOG[:-200]
        if not ok:
            raise RuntimeError((out or {}).get("text") if isinstance(out, dict) else text or "tool error")
        return out


HUB = Hub()
