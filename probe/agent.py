"""Tolerance probe: a small program that runs near a machine or data source, tests it on a timer, and reports to the platform.
Many probes in many places, one view: when one probe fails and the others pass, the problem is on that probe's path, not at the machine.
The machines in this build are replayed data, so the targets are the plant interfaces (OPC UA and the ERP over HTTP). The probe itself is real software.

Run:  python -m probe.agent --name line-side --server http://127.0.0.1:48410
Fault injection for demos (labelled as injected in every report):  --cut opcua   or   --cut erp
"""
import argparse, asyncio, json, os, platform, socket, time
import httpx

OPCUA = os.environ.get("PROBE_OPCUA", "opc.tcp://127.0.0.1:48400/tolerance/plant")
ERP = os.environ.get("PROBE_ERP", "http://127.0.0.1:48401")


async def _opcua():
    from asyncua import Client
    t0 = time.time()
    c = Client(OPCUA, timeout=4)
    await c.connect()
    try:
        t1 = time.time()
        kids = await c.nodes.objects.get_children()
        return {"ok": True, "connect_ms": round((t1 - t0) * 1000), "read_ms": round((time.time() - t1) * 1000), "detail": f"{len(kids)} nodes under Objects"}
    finally:
        await c.disconnect()


def test_opcua(cut):
    if cut:
        return {"name": "opcua", "target": OPCUA, "ok": False, "detail": "injected fault: path cut by the operator of this demo", "injected": True}
    try:
        r = asyncio.run(asyncio.wait_for(_opcua(), 8))
        return {"name": "opcua", "target": OPCUA, **r}
    except Exception as e:
        return {"name": "opcua", "target": OPCUA, "ok": False, "detail": f"{type(e).__name__}: {str(e)[:100]}"}


def test_erp(cut):
    if cut:
        return {"name": "erp", "target": ERP, "ok": False, "detail": "injected fault: path cut by the operator of this demo", "injected": True}
    t0 = time.time()
    try:
        r = httpx.get(ERP + "/manufacturing-orders", timeout=5)
        ms = round((time.time() - t0) * 1000)
        n = len(r.json()) if r.status_code == 200 else 0
        return {"name": "erp", "target": ERP, "ok": r.status_code == 200, "connect_ms": ms, "detail": f"{r.status_code}, {n} orders"}
    except Exception as e:
        return {"name": "erp", "target": ERP, "ok": False, "detail": f"{type(e).__name__}: {str(e)[:100]}"}


def run_tests(cut=()):
    return [test_opcua("opcua" in cut), test_erp("erp" in cut)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--where", default="")
    ap.add_argument("--server", default="http://127.0.0.1:48410")
    ap.add_argument("--every", type=float, default=10.0)
    ap.add_argument("--cut", default="", help="comma list of tests to fail on purpose: opcua, erp")
    a = ap.parse_args()
    cut = {x for x in a.cut.split(",") if x}
    me = {"name": a.name, "where": a.where or socket.gethostname(), "os": platform.platform(), "every": a.every}
    while True:
        try:
            httpx.post(a.server + "/api/probes/report", json={**me, "tests": run_tests(cut), "at": time.time()}, timeout=10)
        except Exception as e:
            print("report failed:", e)
        time.sleep(a.every)


if __name__ == "__main__":
    main()
