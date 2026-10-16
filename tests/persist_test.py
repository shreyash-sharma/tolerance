"""A visitor's work survives a restart: files are copied to a bucket (a folder here) and copied back onto an empty disk. Run:  python tests/persist_test.py"""
import os, shutil, sys, tempfile

DATA = tempfile.mkdtemp(prefix="tol_persist_data_")
BUCKET = tempfile.mkdtemp(prefix="tol_persist_bucket_")
os.environ["TOLERANCE_DATA"] = DATA
os.environ["TOLERANCE_PORT"] = "48480"
os.environ["TOLERANCE_BACKUP_BUCKET"] = "file:" + BUCKET
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workspace import persist

assert persist.enabled()
os.makedirs(os.path.join(DATA, "users"))
os.makedirs(os.path.join(DATA, "uploads", "docs", "u1"))
open(os.path.join(DATA, "users", "u1.json"), "w").write('{"name": "My plant"}')
import duckdb
c = duckdb.connect(os.path.join(DATA, "users", "lake_u1.duckdb"))
c.execute("create schema lake; create table lake.t as select 1 as a union all select 2")
c.close()
open(os.path.join(DATA, "uploads", "docs", "u1", "sop.md"), "w").write("Weld-02 must stop after 3 faults.")
open(os.path.join(DATA, "users", "u1.json.tmp"), "w").write("half written")   # temporary files are not copied
open(os.path.join(DATA, "estate.duckdb"), "w").write("the sample plant is rebuilt, not copied")

assert persist.snapshot() == 3, "three visitor files"
assert persist.snapshot() == 0, "nothing changed"
open(os.path.join(DATA, "users", "u1.json"), "w").write('{"name": "Renamed plant"}')
assert persist.snapshot() == 1, "one changed file"
assert not os.path.exists(os.path.join(BUCKET, "data", "estate.duckdb"))

# the disk is wiped, as on a new container
shutil.rmtree(DATA)
os.makedirs(DATA)
persist._seen.clear()
assert persist.restore() == 3
assert open(os.path.join(DATA, "users", "u1.json")).read() == '{"name": "Renamed plant"}'
assert open(os.path.join(DATA, "uploads", "docs", "u1", "sop.md")).read().startswith("Weld-02")
c = duckdb.connect(os.path.join(DATA, "users", "lake_u1.duckdb"))
assert c.execute("select count(*) from lake.t").fetchone()[0] == 2
c.close()
assert persist.restore() == 0, "a second restore finds nothing missing"
# an existing local file is never overwritten by an older copy
open(os.path.join(DATA, "users", "u1.json"), "w").write('{"name": "newer"}')
persist._seen.clear()
assert persist.restore() == 0 and open(os.path.join(DATA, "users", "u1.json")).read() == '{"name": "newer"}'
print("persist_test ok")
