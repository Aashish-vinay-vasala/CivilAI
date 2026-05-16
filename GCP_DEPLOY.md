# CivilAI — GCP Deployment Guide

## Prerequisites
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- A GCP project with billing enabled (free $300 trial works)

---

## Step 1 — Set your project variables

```bash
export PROJECT_ID="your-gcp-project-id"   # from GCP console
export REGION="us-central1"
export CLUSTER="civilai-cluster"
export REPO="civilai"

gcloud config set project $PROJECT_ID
gcloud config set compute/region $REGION
```

---

## Step 2 — Enable GCP APIs

```bash
gcloud services enable \
  container.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com
```

---

## Step 3 — Create Artifact Registry repository

```bash
gcloud artifacts repositories create $REPO \
  --repository-format=docker \
  --location=$REGION \
  --description="CivilAI Docker images"

# Authenticate Docker to push images
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

---

## Step 4 — Create GKE cluster

```bash
# Autopilot cluster (recommended — Google manages nodes, scales to zero when idle)
gcloud container clusters create-auto $CLUSTER \
  --region $REGION

# OR standard cluster (more control, ~$75/mo for 3 e2-medium nodes)
# gcloud container clusters create $CLUSTER \
#   --region $REGION \
#   --num-nodes 2 \
#   --machine-type e2-standard-2 \
#   --enable-autoscaling \
#   --min-nodes 2 \
#   --max-nodes 6

# Get credentials for kubectl
gcloud container clusters get-credentials $CLUSTER --region $REGION
```

---

## Step 5 — Build and push Docker images (first time)

```bash
# Build backend
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/backend:latest ./backend
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/backend:latest

# Build frontend (replace with your Supabase values)
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key" \
  --build-arg NEXT_PUBLIC_API_URL="http://api.YOUR_DOMAIN.com" \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/frontend:latest \
  ./frontend

docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/frontend:latest
```

---

## Step 6 — Update image references in k8s manifests

Replace `REGION-docker.pkg.dev/PROJECT_ID/civilai` in:
- `k8s/backend-deployment.yaml`
- `k8s/frontend-deployment.yaml`

```bash
# Quick sed replacement
sed -i "s|REGION-docker.pkg.dev/PROJECT_ID|${REGION}-docker.pkg.dev/${PROJECT_ID}|g" \
  k8s/backend-deployment.yaml k8s/frontend-deployment.yaml
```

---

## Step 7 — Create Kubernetes secrets

```bash
# Replace values with your actual credentials
kubectl create namespace civilai

kubectl create secret generic civilai-secrets \
  --namespace civilai \
  --from-literal=GROQ_API_KEY="your-groq-key" \
  --from-literal=SUPABASE_URL="https://your-project.supabase.co" \
  --from-literal=SUPABASE_KEY="your-service-role-key" \
  --from-literal=RESEND_API_KEY="your-resend-key" \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co" \
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
```

---

## Step 8 — Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/hpa.yaml

# Wait for pods to be ready
kubectl rollout status deployment/backend -n civilai
kubectl rollout status deployment/frontend -n civilai
```

---

## Step 9 — Set up Ingress (if you have a domain)

```bash
# Reserve a static IP
gcloud compute addresses create civilai-ip --global

# Get the IP address (note it down for DNS)
gcloud compute addresses describe civilai-ip --global

# Update k8s/ingress.yaml — replace YOUR_DOMAIN.com with your domain
# Then apply:
kubectl apply -f k8s/ingress.yaml
```

Point your domain's DNS A records to the static IP.

---

## Step 10 — Set up Cloud Build CI/CD

```bash
# Grant Cloud Build permission to deploy to GKE
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/container.developer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

Then in [GCP Cloud Build console](https://console.cloud.google.com/cloud-build/triggers):
1. Click **Create Trigger**
2. Connect your GitHub repo
3. Branch: `^main$`
4. Config: `cloudbuild.yaml`
5. Add substitution variables:
   - `_NEXT_PUBLIC_SUPABASE_URL` → your Supabase URL
   - `_NEXT_PUBLIC_SUPABASE_ANON_KEY` → your anon key
   - `_NEXT_PUBLIC_API_URL` → `https://api.YOUR_DOMAIN.com`
6. Save

Every push to `main` now auto-deploys.

---

## Verify deployment

```bash
# Check pods
kubectl get pods -n civilai

# Check services
kubectl get services -n civilai

# Check ingress (may take 5-10 min for GCP to provision)
kubectl get ingress -n civilai

# Stream logs
kubectl logs -f deployment/backend -n civilai
kubectl logs -f deployment/frontend -n civilai

# Check HPA
kubectl get hpa -n civilai
```

---

## Cost estimate (GCP free trial = $300 credits)

| Resource | Spec | ~Monthly cost |
|---|---|---|
| GKE Autopilot | 2 backend pods + 2 frontend pods | ~$60 |
| Artifact Registry | <10 GB images | ~$1 |
| Cloud Build | 120 min/day free, then $0.003/min | ~$0–5 |
| Load Balancer | Global HTTP(S) | ~$18 |
| **Total** | | **~$80–85/mo** |

$300 free credits → ~3.5 months free.

---

## Troubleshooting

**Pods in CrashLoopBackOff:**
```bash
kubectl describe pod <pod-name> -n civilai
kubectl logs <pod-name> -n civilai --previous
```

**Backend image too large (>6GB due to torch):**
The `torch` + `sentence-transformers` packages make the image ~5–6 GB.
If Cloud Build times out, increase `timeout` in `cloudbuild.yaml` or split into a CPU-only
requirements file for production (torch is only needed for local ML training, not inference at scale).

**Frontend build fails (env vars missing):**
Ensure `NEXT_PUBLIC_*` build args are passed — Next.js bakes them in at build time.
