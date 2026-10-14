"""The gateway the Foreman agents use. One Cedar policy, default deny. Each agent is its own principal, so a policy can say what that agent, and only that agent, may read."""
from rca import policy
from fabric import gateway

PRINCIPALS = ("rca", "console", "reader", "scout", "modeler", "diagnosis", "verifier", "planner", "warden", "lineq", "broker")
_gw = {}


def gateway_for():
    """A gateway whose policy covers every read-only MCP tool for every Foreman agent, plus the safety gate for the broker. Rebuilt when the tool set changes."""
    from mcpx.hub import HUB
    ro = HUB.read_only_tools()
    key = tuple(sorted(ro))
    if _gw.get("key") != key:
        _gw["gw"] = gateway.Gateway(policy.build([], mcp=ro, principals=PRINCIPALS))
        _gw["key"] = key
    return _gw["gw"]


def call(agent, tool, args=None, context=None):
    """tool is 'server/tool'. Authorised by Cedar as McpTool::"server/tool" for this agent."""
    return gateway_for().call(agent, "mcp:" + tool, args or {}, context)


def decide_apply(context):
    """May the broker apply an action to the plant? Cedar decides from the score, the user's limit, the hard-limit result and whether a person approved."""
    gw = gateway_for()
    ok, reasons = gw.authorize("broker", "apply", "Env", "plant", context)
    gw._log("broker", "apply_to_plant", {k: v for k, v in context.items()}, ok, reasons, "permitted by the safety gate" if ok else "refused by the safety gate")
    return ok, reasons
