#!/usr/bin/env bash
# Deploy Tolerance to Cloud Run from Cloud Shell (or any shell with gcloud). Usage: ./deploy.sh <project-id> [region]
set -euo pipefail
PROJECT="${1:?usage: ./deploy.sh <project-id> [region]}"
REGION="${2:-asia-southeast1}"
gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com
SA="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="roles/aiplatform.user" >/dev/null
gcloud run deploy tolerance --source . --region "$REGION" --allow-unauthenticated \
  --cpu 2 --memory 2Gi --min-instances 1 --max-instances 1 --no-cpu-throttling --timeout 3600 \
  --set-env-vars "^@^GOOGLE_GENAI_USE_VERTEXAI=true@GOOGLE_CLOUD_PROJECT=$PROJECT@GOOGLE_CLOUD_LOCATION=global@TOLERANCE_MODELS=gemini-2.5-flash,gemini-3-flash-preview@FALLBACK_GEMMA=0"
gcloud run services describe tolerance --region "$REGION" --format='value(status.url)'
