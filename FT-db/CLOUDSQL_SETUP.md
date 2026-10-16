# Cloud SQL for the demo (you run these; replace the words in CAPITALS)

Use a throw-away project or your hackathon project. The database holds made-up data only.

## 1. Create the instance (about 5 minutes)
```
gcloud sql instances create tolerance-erp --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-f1-micro --region=asia-southeast1 --root-password=LONG_RANDOM_PASSWORD --authorized-networks=0.0.0.0/0
gcloud sql databases create erp --instance=tolerance-erp
gcloud sql instances describe tolerance-erp --format="value(ipAddresses[0].ipAddress,state)"
```
`0.0.0.0/0` lets any computer try to log in, including the Cloud Run app, whose address changes. The password must be long and random. Delete the instance after the hackathon.

## 2. Load the demo data (from your laptop)
```
pip install psycopg2-binary
python FT-db/seed_postgres.py "postgresql://postgres:LONG_RANDOM_PASSWORD@INSTANCE_IP:5432/erp"
```

## 3. Let the app start and read the instance
The app runs as the Cloud Run service account. Give it a role on THIS instance only:
```
SA=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')-compute@developer.gserviceaccount.com
gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:$SA" --role="roles/cloudsql.editor" --condition="expression=resource.name == 'projects/PROJECT_ID/instances/tolerance-erp',title=only-tolerance-erp"
```
On your laptop, the app uses your own login: run `gcloud auth application-default login` once.

## 4. In the app
- Connect step, PostgreSQL card: `postgresql://postgres:LONG_RANDOM_PASSWORD@INSTANCE_IP:5432/erp`, press Test, then Connect.
- Probes page, "Cloud database": project id, instance `tolerance-erp`, stations that lose data (`WH1, C1, C2`), press "Check and watch".

## 5. The demo moment
Stop it (from a terminal, or from the Google Cloud console):
```
gcloud sql instances patch tolerance-erp --activation-policy=NEVER
```
Within about 10 seconds the app opens an incident and Telegram asks. Tap Approve: the app sends the start (`--activation-policy=ALWAYS`), the instance comes back in 1 to 3 minutes, and the incident closes.
Before the video, check once: `gcloud sql instances describe tolerance-erp --format="value(state,settings.activationPolicy)"` shows `RUNNABLE ALWAYS`.
