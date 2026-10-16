# IT landscape of Line 1 (gateway computer)

Line 1 has one gateway computer. It is called pcb-gateway.plant.local. It runs the services below.

Inspection results for C1, C2 and TR are stored in the MongoDB collection `inspections` on pcb-gateway.plant.local:27017. The database is `plant`.
Maintenance notes are stored in the MongoDB collection `maintenance` on pcb-gateway.plant.local:27017.
The MongoDB service is called mongod. It runs on the gateway computer.
The oven temperature, the conveyor speed and the AOI result are published to an MQTT broker on pcb-gateway.plant.local:1883. The topics start with plant/pcb.
The MQTT service is called mosquitto. It also runs on the gateway computer.

If a service on the gateway stops, the supervisor decides when to start it again.
Work orders and materials live in the PostgreSQL database `erp` on erp-db.plant.local:5432. It runs as a Google Cloud SQL instance.
