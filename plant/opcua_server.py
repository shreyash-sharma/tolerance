"""OPC UA simulator for the line: stations and the battery-management gateway. Synthetic, read-only variables."""
import asyncio, threading
from asyncua import Server, ua

from .core import PORT
ENDPOINT = f"opc.tcp://127.0.0.1:{PORT}/tolerance/plant"
STATIONS = {"ST-PCB-01": "PCB flashing", "ST-PACK-02": "Pack scan", "ST-EOL-03": "End of line"}


async def _serve(ready):
    s = Server()
    await s.init()
    s.set_endpoint(ENDPOINT)
    s.set_server_name("Tolerance synthetic plant")
    idx = await s.register_namespace("urn:tolerance:plant")
    line = await s.nodes.objects.add_object(idx, "Line1")
    stations = await line.add_object(idx, "Stations")
    for name, desc in STATIONS.items():
        st = await stations.add_object(idx, name)
        await st.add_variable(idx, "Description", desc)
        await st.add_variable(idx, "LastSerial", "PCB-40000" if name == "ST-PCB-01" else ("PK-70000" if name == "ST-PACK-02" else "EVX1000000"))
        await st.add_variable(idx, "LastResult", "ACK")
        await st.add_variable(idx, "Counter", 40)
    dev = await line.add_object(idx, "Devices")
    bms = await dev.add_object(idx, "BMS-GW")
    await bms.add_variable(idx, "LastBmsId", "BMS-900")
    await bms.add_variable(idx, "PackSerial", "PK-70000")
    async with s:
        ready.set()
        while True:
            await asyncio.sleep(1)


def start():
    ready = threading.Event()
    t = threading.Thread(target=lambda: asyncio.run(_serve(ready)), daemon=True)
    t.start()
    ready.wait(15)
    return t
