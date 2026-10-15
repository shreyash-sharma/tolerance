"""The owner's own MCP server: connect over HTTP, list its tools, call a read-only tool through the policy gateway, and see an acting tool denied. Run:  python tests/mcp_remote_test.py"""
import json, os, sys, tempfile, threading, time

os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_mcp_")
os.environ["TOLERANCE_PORT"] = "48470"
os.environ["TOLERANCE_ALLOW_PRIVATE_NOTIFY"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

plant = FastMCP("MES gateway", host="127.0.0.1", port=18851)

@plant.tool(annotations=ToolAnnotations(readOnlyHint=True))
def station_status(station: str) -> dict:
    """Current state of one station."""
    return {"station": station, "state": "FAULT", "since_min": 12}

@plant.tool(annotations=ToolAnnotations(readOnlyHint=False))
def restart_station(station: str) -> dict:
    """Restart a station."""
    return {"restarted": station}

threading.Thread(target=lambda: plant.run(transport="streamable-http"), daemon=True).start()
time.sleep(3)

from workspace import store
store.UID.set("mcptester")
from server import ws_api
from mcpx.hub import HUB
from connectors import probes as P

# the Test button: connects and counts the tools
t = P.test("mcp", "http://127.0.0.1:18851/mcp")
assert t["ok"] and t["detail"]["tools"] == 2 and t["detail"]["read_only"] == 1, t

# connect for real
r = json.loads(ws_api.mcp_connect(ws_api.McpBody(url="http://127.0.0.1:18851/mcp", name="MES MCP server", quote="The MES MCP server runs at http://127.0.0.1:18851/mcp.")).body)
sid = r["server"]["id"]
assert sid.startswith("remote:") and {x["name"] for x in r["server"]["tools"]} == {"station_status", "restart_station"}, r
assert any(sv["id"] == sid for sv in HUB.servers())   # it joins the hub

# through the gateway, as an agent would: the read-only tool runs, the acting tool is denied
gw = ws_api._mcp_gw()
ok = gw.call("console", f"mcp:{sid}/station_status", {"station": "Weld-02"})
assert ok["ok"] and ok["result"]["state"] == "FAULT", ok
no = gw.call("console", f"mcp:{sid}/restart_station", {"station": "Weld-02"})
assert not no["ok"] and no.get("denied"), no
assert any(a["decision"] == "DENY" for a in gw.audit)

# another visitor does not see it
store.UID.set("someone-else")
assert not any(sv["id"] == sid for sv in HUB.servers())
store.UID.set("mcptester")
ws_api.mcp_remote_remove(sid)
assert not any(sv["id"] == sid for sv in HUB.servers())
print("mcp_remote_test ok", flush=True)
os._exit(0)
