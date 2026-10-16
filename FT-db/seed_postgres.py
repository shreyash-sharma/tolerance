"""Loads made-up ERP data into a PostgreSQL database for the demo. Run once from your laptop:
    pip install psycopg2-binary
    python seed_postgres.py "postgresql://postgres:PASSWORD@INSTANCE_IP:5432/erp"
Creates the table erp_orders (60 rows, always the same) and erp_materials (24 rows). Safe to run again: it drops and refills both tables."""
import random, sys
import psycopg2

if len(sys.argv) != 2:
    sys.exit(__doc__)
rnd = random.Random(11)
products = ["Control board A12", "Power module P7", "Sensor pack S3", "Display unit D5", "Gateway G1"]
stations = ["WH1", "C1", "TR", "C2", "WH2"]
status = ["planned", "in progress", "done", "done", "done", "late"]
con = psycopg2.connect(sys.argv[1])
cur = con.cursor()
cur.execute("drop table if exists erp_orders; drop table if exists erp_materials;")
cur.execute("create table erp_orders (order_id text primary key, product text, qty int, station text, status text, due date, value_eur numeric)")
cur.execute("create table erp_materials (sku text primary key, name text, on_hand int, reorder_at int)")
for i in range(1, 61):
    cur.execute("insert into erp_orders values (%s,%s,%s,%s,%s,current_date + %s,%s)", (f"MO-{1000 + i}", rnd.choice(products), rnd.choice([20, 50, 100, 250]), rnd.choice(stations), rnd.choice(status), rnd.randint(-5, 20), round(rnd.uniform(800, 18000), 2)))
for i in range(1, 25):
    cur.execute("insert into erp_materials values (%s,%s,%s,%s)", (f"SKU-{200 + i}", rnd.choice(["Solder paste", "PCB blank", "Capacitor reel", "Resistor reel", "Connector", "Heat sink"]) + f" {i}", rnd.randint(0, 900), rnd.choice([50, 100, 200])))
con.commit()
print("loaded erp_orders:", 60, "erp_materials:", 24)
