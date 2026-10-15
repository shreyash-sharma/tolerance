"""The systems the documents name are found one per instance: two databases of one kind are two entries, each with the exact sentence. Run:  python tests/systems_test.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from documents import systems as DS

DOCS = [
    {"name": "inspection_sop.md", "text": "# Inspection\nInspection results are written to the MongoDB collection `inspections` on mongo1.plant.local:27017 after each unit.\nMaintenance notes go to the MongoDB collection `maintenance` on mongo2.plant.local:27017.\nOperators may not skip the torque check."},
    {"name": "it_overview.md", "text": "Work orders live in SAP. The MES reads them through the ERP gateway at http://erp.plant.local/odata. Sensor data goes through an MQTT broker.\nThe MES keeps station states in a Postgres database named mesdb on 10.0.4.12:5432.\nQuality results sit in a Postgres database named qmsdb on 10.0.4.15:5432.\nThe MES MCP server runs at https://mcp-mes.plant.example/sse.\nThe SAP MCP server runs at https://mcp-sap.plant.example/sse.\nA historian MCP server is planned."},
    {"name": "note.txt", "text": "The message was sent. The same process applies. Please remember to wash your hands."},
]
res = DS.find(DOCS)
by = {}
for e in res:
    by.setdefault(e["type"], []).append(e)
assert len(by["mongo"]) == 2 and {e["hint"] for e in by["mongo"]} == {"mongo1.plant.local:27017", "mongo2.plant.local:27017"}
assert len(by["postgres"]) == 2 and {e["hint"] for e in by["postgres"]} == {"10.0.4.12:5432", "10.0.4.15:5432"}
assert len(by["mcp"]) == 3, [e["id"] for e in by["mcp"]]
assert {e["hint"] for e in by["mcp"]} >= {"https://mcp-mes.plant.example/sse", "https://mcp-sap.plant.example/sse"}
assert any(e["label"] == "historian" for e in by["mcp"])
assert "sap" in by and "mqtt" in by and "erp" in by
assert len({e["id"] for e in res}) == len(res)   # every entry has its own id
for e in res:
    assert e["name"]
    for q in e["quotes"]:
        text = next(d["text"] for d in DOCS if d["name"] == q["doc"])
        assert q["quote"].replace("`", "") in text.replace("`", ""), q   # every quote is words from the page
print("systems_test ok:", [e["name"] for e in res])
