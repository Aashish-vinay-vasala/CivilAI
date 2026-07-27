# Deploying CivilAI — Cloud Run (backend) + Firebase Hosting (frontend)

No Dockerfile is used for this path. Cloud Run builds the backend straight from
source with Google Cloud buildpacks; the frontend is a static Next.js export
served by Firebase Hosting. (The `Dockerfile`/`cloudbuild.yaml`/`k8s/` setup in
`GCP_DEPLOY.md` is a separate, older GKE-based path — unrelated to this one.)

Project: `gen-lang-client-0881995245` (same GCP project backs both Cloud Run and
Firebase Hosting). Region: `us-central1`.

## One-time setup

```powershell
gcloud auth login
gcloud config set project gen-lang-client-0881995245
firebase login
```

Copy `backend/env.yaml.example` → `backend/env.yaml` and fill in real secrets
(GROQ_API_KEY, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY,
HUGGINGFACE_TOKEN). This file is gitignored.

## Deploy

```powershell
# 1. Backend → Cloud Run
pwsh deploy/deploy-backend.ps1
# prints the service URL, e.g. https://civilai-backend-xxxxx-uc.a.run.app

# 2. Point the frontend at that URL
#    edit frontend/.env.production: NEXT_PUBLIC_API_URL=<the URL from step 1>

# 3. Frontend → Firebase Hosting
pwsh deploy/deploy-frontend.ps1
```

## How the backend avoids shipping torch

`backend/requirements.txt` is the full local/ML-training set (~2GB, includes
torch). Cloud Run buildpacks only ever read a file literally named
`requirements.txt`, so `deploy-backend.ps1` stages a temp copy of `backend/`
with `requirements.prod.txt` (the lean API-serving set — same one the old
Dockerfile used) swapped in as `requirements.txt` before calling
`gcloud run deploy --source`. Your real `backend/requirements.txt` is never
touched.

`backend/Procfile` tells the buildpack how to start the app
(`uvicorn main:app --host 0.0.0.0 --port $PORT`); `backend/.python-version`
pins it to Python 3.11.

## Redeploying after code changes

Just re-run the two scripts — `gcloud run deploy --source` and
`firebase deploy` both rebuild from current source each time.

## Updating CORS

`backend/env.yaml`'s `ALLOWED_ORIGINS` must list every domain the frontend is
served from. Defaults to the two standard Firebase Hosting domains
(`https://gen-lang-client-0881995245.web.app` and `...firebaseapp.com`) — add
a custom domain here too if you attach one in Firebase Hosting settings.
