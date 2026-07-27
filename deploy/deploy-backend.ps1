# Deploys backend/ to Cloud Run using Google Cloud buildpacks — no Dockerfile.
# Builds from source; Cloud Build/buildpacks detect Python via requirements.txt
# and use backend/Procfile for the start command.
#
# Prereqs:
#   - gcloud CLI authenticated (gcloud auth login) with access to the project below
#   - backend/env.yaml created from backend/env.yaml.example with real secrets
#
# Usage: pwsh deploy/deploy-backend.ps1

$ErrorActionPreference = "Stop"

$ProjectId = "gen-lang-client-0881995245"
$Region    = "us-central1"
$Service   = "civilai-backend"

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$EnvFile    = Join-Path $BackendDir "env.yaml"

if (-not (Test-Path $EnvFile)) {
    throw "backend/env.yaml not found. Copy backend/env.yaml.example to backend/env.yaml and fill in real values first."
}

# Buildpacks always read the literal filename `requirements.txt`. The repo's
# requirements.txt is the full local/ML-training set (includes torch, ~2GB+),
# but requirements.prod.txt is the lean API-serving set the Dockerfile has
# always used in production. Stage a temp copy of backend/ with prod deps
# swapped in so Cloud Run builds the same lean image without touching the
# real requirements.txt (still needed locally for ML work).
$StageDir = Join-Path ([System.IO.Path]::GetTempPath()) "civilai-backend-deploy"
if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
New-Item -ItemType Directory -Path $StageDir | Out-Null

Write-Host "Staging build context in $StageDir ..."
# Exclude Dockerfile/.dockerignore: gcloud run deploy --source prefers a
# Dockerfile over buildpacks when one is present, which would silently
# defeat the whole point of this script.
robocopy $BackendDir $StageDir /E /XD venv __pycache__ .pytest_cache data nemo_config /XF mlflow.db *.pyc Dockerfile .dockerignore | Out-Null

Copy-Item (Join-Path $BackendDir "requirements.prod.txt") (Join-Path $StageDir "requirements.txt") -Force

if (Test-Path (Join-Path $StageDir "Dockerfile")) {
    throw "Dockerfile leaked into the staged build context - aborting before it gets used instead of buildpacks."
}

Write-Host "Deploying $Service to Cloud Run ($ProjectId / $Region) ..."
gcloud run deploy $Service `
    --source $StageDir `
    --project $ProjectId `
    --region $Region `
    --allow-unauthenticated `
    --env-vars-file $EnvFile `
    --memory 2Gi `
    --cpu 2 `
    --timeout 300 `
    --min-instances 0 `
    --max-instances 3

Remove-Item -Recurse -Force $StageDir

Write-Host ""
Write-Host "Done. Service URL:"
gcloud run services describe $Service --project $ProjectId --region $Region --format "value(status.url)"
