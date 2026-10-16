# IT landscape

Station states come from the MES, which writes a log of RUN, IDLE and FAULT for every station.
Inspection results for Paint-03, Assembly-04 and Test-05 are stored in the MongoDB collection `inspections` on mongo1.plant.local:27017.
Maintenance notes are stored in the MongoDB collection `maintenance` on mongo2.plant.local:27017.
Work orders and materials live in the ERP database `erp` on erp-db.plant.local:5432 (PostgreSQL).
Vibration and motor temperature are published to an MQTT broker every 30 minutes.
The MES MCP server runs at https://mcp-mes.plant.example/sse.
The ERP MCP server runs at https://mcp-erp.plant.example/sse.
