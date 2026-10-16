# Small change for Codex: station names in the MongoDB data

The demo documents say: "Inspection results for C1, C2 and TR are stored in the MongoDB collection `inspections`." The data on the VM uses other station names (Paint-03, Assembly-04, Test-05). Make them match.

1. Edit `~/FT-db/seed_mongo.py`. In both collections use these stations instead: `C1`, `C2`, `TR`. Keep the fixed random seed, the counts (900 and 60) and all other fields.
2. Run the seed again for the database `plant` (drop and refill both collections; do not touch other databases on this VM; PostgreSQL and nginx on this VM are not ours).
3. Check, with the `reader` user, and paste the output: the two counts, `distinct station` for each collection, one sample document from each.
4. Run `~/FT-db/reset.sh` and `~/FT-db/status.sh --once` and paste the output.
