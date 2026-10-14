# Deploying Tolerance to Google Cloud Run

Cloud Run is required by the AI Builder Cup. Nothing needs installing locally: use **Cloud Shell** (gcloud is pre-installed and logged in).

## 1. One-time
1. Open https://console.cloud.google.com, pick (or create) a project with billing or trial credits.
2. Click **Activate Cloud Shell**, then clone or upload this repository:
   ```bash
   git clone <your repository url> tolerance && cd tolerance
   ```

## 2. Deploy
```bash
./deploy.sh <your-project-id> asia-southeast1
```
The script enables the APIs, grants the runtime service account `roles/aiplatform.user` (so Gemini runs through **Vertex AI**, with no API key in the container), and deploys with:
- one instance only (`--min-instances 1 --max-instances 1`): the live feed and connectors keep state in memory;
- CPU always allocated (`--no-cpu-throttling`): background threads keep ingesting between requests;
- 2 vCPU, 2 GiB.

It prints the service URL. Open it and press **Run the mission**.

## 3. Models
`TOLERANCE_MODELS` (set by the script to `gemini-2.5-flash,gemini-3-flash-preview`) is the ordered pool. If a model is out of quota or unavailable, the next one is used; if all are, the investigator falls back to the rule-based one and says so on screen. Change the pool with:
```bash
gcloud run services update tolerance --region asia-southeast1 --update-env-vars TOLERANCE_MODELS=gemini-2.5-flash
```

## Notes
- Cost: a prototype with one always-on instance is covered by Cloud Run's free allowance only partly; check the pricing page and set a budget alert. Delete the service after the competition: `gcloud run services delete tolerance --region asia-southeast1`.
- The unmodified published machine log ships in `seed/sdu` with its CC BY 4.0 attribution.
- Do not put API keys in the image. Local development reads `GEMINI_API_KEY` from an untracked `.env`.
