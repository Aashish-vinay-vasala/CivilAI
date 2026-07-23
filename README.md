# CivilAI — AI-Powered Construction Management Platform

CivilAI is a full-stack construction management platform for project directors, site engineers, and contractors. It combines traditional project-management workflows (schedules, budgets, contracts, safety, procurement, workforce) with an AI layer: an LLM copilot/agent, ML cost-overrun prediction, document/contract analysis, voice interaction, and a Model Context Protocol (MCP) server that exposes the same tools to external AI clients like Claude Desktop and Claude Code.

### 🔗 Live

| Service | URL |
|---|---|
| Web App | [https://gen-lang-client-0881995245.web.app](https://gen-lang-client-0881995245.web.app/) |
| Backend API | [https://civilai-backend-189758336630.us-central1.run.app](https://civilai-backend-189758336630.us-central1.run.app) |
| ML API | [https://civilai-ml-enifkvxpja-uc.a.run.app](https://civilai-ml-enifkvxpja-uc.a.run.app) |

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Backend](#backend)
- [Frontend](#frontend)
- [AI & Agent System](#ai--agent-system)
- [MCP (Model Context Protocol)](#mcp-model-context-protocol)
- [Machine Learning](#machine-learning)
- [Guardrails, Safety & Human-in-the-Loop](#guardrails-safety--human-in-the-loop)
- [Data Layer](#data-layer)
- [Docker](#docker)
- [Kubernetes](#kubernetes)
- [Cloud Deployment (GCP)](#cloud-deployment-gcp)
- [CI/CD](#cicd)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)

---
<img width="1917" height="905" alt="civil1" src="https://github.com/user-attachments/assets/f83b6555-d832-4a04-a2c3-e96160a4c895" />
<img width="1917" height="917" alt="civil2" src="https://github.com/user-attachments/assets/b42dea80-13f7-43bb-aebe-b9728adb73ea" />
<img width="1917" height="903" alt="civil3" src="https://github.com/user-attachments/assets/e6499234-328a-4201-9a46-4ea22bce4276" />
<img width="1917" height="912" alt="civil4" src="https://github.com/user-attachments/assets/bae76ca1-87bd-4a46-9f48-d80397c60ae8" />
<img width="1917" height="912" alt="civil5" src="https://github.com/user-attachments/assets/79584cc8-6bd5-49aa-9a0b-fdb61c0b9dfc" />
<img width="1910" height="905" alt="civil6" src="https://github.com/user-attachments/assets/cecf8060-ad30-4d31-bc9b-80a750a6b23f" />
<img width="1917" height="901" alt="civil7" src="https://github.com/user-attachments/assets/26ebd0fa-4a94-4c1c-9724-f901baa5731b" />
<img width="1917" height="906" alt="civil8" src="https://github.com/user-attachments/assets/20fc8f7a-1897-4af3-bb6b-90256c839feb" />
<img width="1917" height="908" alt="civil9" src="https://github.com/user-attachments/assets/25f7fc89-0768-41fb-8d4e-715aebab3416" />
<img width="1916" height="907" alt="civil10" src="https://github.com/user-attachments/assets/e74a94d1-6f24-4f6a-8ad4-f81c20972269" />
<img width="1917" height="896" alt="civil11" src="https://github.com/user-attachments/assets/894e70a2-32bd-499c-ab30-de787ba1efe6" />
<img width="1917" height="911" alt="civil12" src="https://github.com/user-attachments/assets/faea39c0-00a4-44db-b65f-2945c609e333" />



## Architecture Overview

```
┌──────────────────────┐        ┌──────────────────────────────────────────┐
│   Frontend (Next.js)  │──────▶│              Backend (FastAPI)             │
│   React 19 / TS       │  REST │  Auth · Domain APIs · AI Agent · ML · MCP  │
│   port 3000            │  WS   │              port 8000                     │
└──────────────────────┘        └───────┬─────────────┬──────────┬──────────┘
                                          │             │          │
                                    ┌─────▼────┐  ┌─────▼────┐ ┌───▼──────┐
                                    │ Supabase │  │  Redis   │ │  Groq /  │
                                    │ Postgres │  │ (Celery, │ │  Gemini /│
                                    │ + Auth   │  │  rate    │ │  HF LLMs │
                                    │          │  │  limit)  │ │          │
                                    └──────────┘  └──────────┘ └──────────┘

                                    ┌────────────────────────────┐
                                    │  MCP Server (stdio)        │
                                    │  backend/app/mcp/server.py │
                                    │  — same tools as AI agent  │
                                    │  → Claude Desktop / Code   │
                                    └────────────────────────────┘

                                    ┌────────────────────────────┐
                                    │  ML Service (standalone)    │
                                    │  ml/ — training, MLflow,    │
                                    │  Prefect, drift monitoring  │
                                    │  port 8001                  │
                                    └────────────────────────────┘
```

The **backend** is the system of record and the only service that talks to Supabase/Postgres, Redis, and the LLM providers. The **frontend** is a statically-exported Next.js app that talks to the backend over REST/WebSocket. The **MCP server** is a thin stdio wrapper around the exact same tool functions used by the in-app AI agent, so any MCP-compatible client gets identical results to the web UI's copilot. The **ML component** (`ml/`) is a separate, standalone service used for model research/training/monitoring; production inference is served directly from the backend via a versioned model store.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind CSS v4, pnpm |
| Backend | FastAPI (Python 3.11+), Uvicorn |
| Database / Auth | Supabase (Postgres + JWT/JWKS auth) |
| Cache / Queue | Redis (Celery broker, distributed rate limiting) |
| AI Orchestration | LangGraph (ReAct agent), PydanticAI (structured-output alt agent) |
| LLM Providers | Groq (Llama 3.3 70B, primary), Google Gemini (fallback), Hugging Face (Qwen judge, LlamaGuard) |
| Agent Interop | MCP (Model Context Protocol) via `mcp.server.fastmcp` |
| ML | scikit-learn, XGBoost, PyTorch + torch_geometric (GNN), MLflow, Prefect |
| Observability | LangSmith, OpenTelemetry |
| Containers | Docker, Docker Compose |
| Orchestration | Kubernetes (GKE), HPA, GCE Ingress + Managed Certificates |
| CI/CD | GitHub Actions, Google Cloud Build |

---

## Backend

`backend/` — FastAPI app (`backend/main.py`), title `CivilAI API`, served by Uvicorn.

**Cross-cutting setup in `main.py`:**
- CORS configured from `CORS_ORIGINS` / `ALLOWED_ORIGINS`
- Custom `RateLimiterMiddleware` (`app/middleware/rate_limiter.py`) — Redis-backed when `REDIS_URL` is set, in-memory fallback otherwise
- LangSmith + OpenTelemetry tracing bootstrapped via `app.core.telemetry.setup_all()`
- Per-module access control via a `require_module_access(...)` dependency applied to nearly every router (module names such as `"chatbot"`, `"construction"`, `"payments"`). `auth`, `copilot`, and `support` are intentionally left open for pre-auth/anonymous flows.

**Domain API routers** mounted under `/api/v1/...`:

`auth` · `copilot` · `chatbot` · `construction` · `payments` · `projects` · `vendors` · `green` · `ml` · `material-prices` · `documents` · `writing` · `contracts` · `safety` · `cost` · `schedule` · `workforce` · `procurement` · `compliance` · `equipment` · `reports` · `bim` · `transcribe` · `email` · `preconstruction` · `financials` · `review` (human-review queue) · `support` · `voice` · `agent` · `evaluation` · `judge` · `accounting` · `notifications` · `tenders`

Plus root `GET /` and `GET /health`.

Representative endpoints:
- **ML** (`ml.py`): `POST /cost-overrun`, `/delay`, `/safety-risk`, `/turnover`, `/equipment-failure`, `GET /safety-stats`, `/delay-stats`, `/workforce-stats`, `/equipment-stats`, `/performance-trend`, `GET /cost-overrun-auto`, `POST /cost-overrun/train`, `POST /cost-overrun/dataset/validate`, `GET /cost-overrun/history`, `POST /cost-overrun/versions/{version}/activate`
- **Agent** (`agent.py`): chat, streaming (SSE), intent classification, file upload, session list/delete, health
- **Evaluation** (`evaluation.py`): `POST /ragas`, `/deepeval`, `/batch` — automated LLM-output quality evaluation
- **Judge** (`judge.py`): `GET /rubrics`, `POST /score`, `/compare`, `/batch` — LLM-as-judge scoring via a Hugging Face Qwen model (deliberately a different model family than the Groq/Llama generator, to avoid self-preference bias)

**Auth**: Supabase Auth JWTs, verified backend-side against Supabase's JWKS (asymmetric ES256), cached for one hour. `AUTH_REQUIRED` gates sensitive routes (`/financials`, `/payments`, `/vendors`, `/contracts`). Demo flow available via `POST /api/v1/auth/demo-login`.

**Notable backend folders:**
- `app/ai/` — all LLM logic: agents, per-domain analyzers (cost, safety, schedule, contracts, compliance, equipment, vendor, procurement, workforce, payment, green, budget, material price, accounting), copilot/dialogue management, memory (mem0/Zep), RAG (`llama_rag.py`), report generation, voice/VAD processing
- `app/core/` — `database.py` (Supabase client), `security.py` (JWT/JWKS), `guardrails.py`, `nemo_rails.py`, `llama_guard.py`, `hitl.py`, `telemetry.py`
- `app/mcp/server.py` — the MCP server (see below)
- `app/ml_models/cost_overrun/` — versioned model artifact store
- `app/services/` — BIM, ML training/serving, caching, storage, structural analysis, usage tracking, voice DB, web search
- `app/scripts/` — training data export, fallback model generation, judge calibration, demo user seeding

## Frontend

`frontend/` — Next.js 16 App Router app, React 19, TypeScript, Tailwind CSS v4, built with pnpm and statically exported (`pnpm build` → `/out`, served in production by `serve`).

**Key libraries:**
- Data/auth: `@supabase/supabase-js`, `@supabase/ssr`, `@supabase/auth-helpers-nextjs`
- State/data-fetching: `@tanstack/react-query`, `@tanstack/react-table`, `zustand`
- Forms/validation: `react-hook-form`, `zod`
- Visualization: `recharts`, `d3`, `three` / `@react-three/fiber` / `@react-three/drei` (3D — BIM/digital-twin), `dhtmlx-gantt` (scheduling), `leaflet` / `react-leaflet` (maps)
- Realtime: `socket.io-client`
- Documents/export: `docx`, `jspdf`, `jspdf-autotable`, `xlsx`
- UI: Radix UI / shadcn primitives, `lucide-react`, `class-variance-authority`, `framer-motion`
- PWA: `next-pwa`

**Major dashboard sections** (`src/app/(dashboard)/`): dashboard, projects, agent, copilot, analytics, anomaly, bim, compliance, construction, contracts, cost, daily-reports, digital-twin, documents, equipment, evm, financials, gnn, green, meetings, mlops, payments, pre-construction, predictive, procurement, qr-tracker, reports, resource-leveling, review, rfis, safety, scenario, scheduled-reports, scheduling, settings, support, team, transcribe, vendors, voice, weather, workforce, writing.

---

## AI & Agent System

CivilAI ships **two interchangeable single-agent implementations**, both tool-calling agents over the same domain tool set (there is no multi-role agent swarm — orchestration is single-agent-with-tools, with MCP as the interop layer for external multi-agent hosts like Claude Code):

1. **Primary — LangGraph ReAct agent** (`app/ai/agent_copilot.py`)
   Built with `langgraph.prebuilt.create_react_agent`, model `llama-3.3-70b-versatile` via `ChatGroq`. System prompt frames it as "CivilAI Agent" for project directors, site engineers, and contractors. Behavior rules baked into the prompt:
   - Always extract `[project_id: <uuid>]` context prefixes
   - Always call a live-data tool before answering domain questions (no hallucinated numbers)
   - Cite relevant standards (OSHA, IBC, ACI, FIDIC, NEC) where applicable
   - Treat tool-returned data as untrusted content (defense against prompt injection embedded in project data)
   - Consistent bold-heading response formatting
   - Streaming responses (SSE), token/budget tracking, automatic Groq → Gemini fallback on rate-limit/daily-limit errors, and dynamic per-message tool selection (`_select_tools`) — only `list_projects` and `get_project_dashboard` are always loaded; the rest are chosen contextually to keep the tool-calling surface small and relevant.

2. **Alternative — PydanticAI agent** (`app/ai/pydantic_agent.py`)
   Structured-output agent returning a typed `ConstructionAnswer` (`answer`, `confidence`, `domain`, `follow_up`), also Groq-backed. Used where a strictly-typed response contract is preferred over free-form ReAct tool loops.

Both agents call into the same set of ~28 domain tool functions (project data, safety, cost, schedule, contracts, compliance, equipment, vendors, procurement, workforce, green metrics, EVM, BIM, ML prediction, document/report generation) — these are the same functions registered with the MCP server.

---

## MCP (Model Context Protocol)

CivilAI exposes its entire AI tool surface over MCP, so any MCP-compatible client (Claude Desktop, Claude Code, other agent hosts) can call the exact same functions the in-app copilot uses — same code path, same results.

**Configuration** — `.mcp.json` (repo root) registers three MCP servers:

```json
{
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] },
    "supabase":   { "command": "npx", "args": ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"],
                     "env": { "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}" } },
    "civilai":    { "command": "backend/venv/Scripts/python.exe", "args": ["backend/app/mcp/server.py"] }
  }
}
```

- **`civilai`** — the project's own MCP server (`backend/app/mcp/server.py`), built on `mcp.server.fastmcp.FastMCP("CivilAI")`. It imports the tool registry directly from `app.ai.agent_copilot` and registers every one of them as an MCP tool. Runs locally over stdio (no network exposure); also runnable standalone via `python -m app.mcp.server`.
- **`supabase`** — official read-only Supabase MCP server, for direct (safe) database inspection from an MCP client.
- **`playwright`** — official Playwright MCP server, for browser automation against the running frontend (used for manual/agentic UI testing).

**Tools exposed by the `civilai` MCP server** (mirrors `agent_copilot._TOOLS`):

`list_projects`, `get_project_dashboard`, `analyze_schedule_data`, `analyze_safety_data`, `analyze_cost_data`, `analyze_contract_data`, `analyze_contract_terms`, `calculate_evm_metrics`, `assess_compliance_data`, `analyze_equipment_data`, `analyze_vendor_data`, `extract_material_prices_from_text`, `extract_budget_items_from_text`, `analyze_payment_data`, `get_accounting_reconciliation`, `analyze_workforce_data`, `analyze_procurement_data`, `assess_green_metrics`, `analyze_punch_list_data`, `summarize_meetings`, `get_evm_history`, `analyze_bim_data`, `run_what_if_scenario`, `generate_advanced_report`, `generate_document`, `predict_cost_overrun_ml`, `log_safety_incident`, `update_schedule_task_status`, `add_punch_list_item`.

To use the `civilai` MCP server standalone with an MCP client, point it at:
```
backend/venv/Scripts/python.exe backend/app/mcp/server.py
```
(requires the backend's Python virtualenv to be set up with `backend/requirements.txt` and a valid `backend/.env`).

---

## Machine Learning

Two ML surfaces exist: a **standalone research/training service** (`ml/`) and **production-serving code embedded in the backend** (`backend/app/`).

### Standalone ML service (`ml/`)

- Its own FastAPI app (`ml/api/main.py`, "CivilAI ML API"), designed to run on **port 8001**, separate from the main backend. Not currently wired into `docker-compose.yml` or `k8s/` — it's used for offline training/experimentation rather than production request serving.
- `ml/data/raw/` — training datasets: `cost_overrun.csv`, `construction_delays.csv`, `safety_incidents.csv`, `workforce.csv`, `equipment.csv`, material price series (`cement_prices.csv`, `copper_prices.csv`, `lumber_prices.csv`, `steel_prices.csv`), plus raw PM forms/tasks exports. `download_data.py` generates/fetches this data.
- `ml/models/train_all.py` — trains cost-overrun, delay, safety-risk, workforce-turnover, and equipment-failure models using **scikit-learn** (`RandomForestClassifier`/`Regressor`) and **XGBoost**, persisted with `joblib`.
- `ml/models/gnn_risk.py` — a **PyTorch + torch_geometric** Graph Neural Network (`GCNConv`/`GATConv`) modeling construction risk propagation across project nodes (degrades gracefully if `torch_geometric` isn't installed).
- `ml/pipelines/train_pipeline.py` — **Prefect**-orchestrated training pipeline.
- `ml/mlflow_tracking.py` + `ml/mlruns/` — **MLflow** experiment tracking and model registry.
- `ml/monitoring/` — `drift_detector.py`, `performance_monitor.py`, `model_comparison.py`, `prediction_logger.py` for post-deployment model health.

### Production ML (backend)

- `app/services/cost_overrun_trainer.py` implements a **model versioning system**: each training run writes a new version to `backend/app/ml_models/cost_overrun/versions/v{n}/` (`classifier.pkl`, `regressor.pkl`, `encoder.pkl`, `manifest.json`, `metrics.json`, `params.json`) without overwriting prior versions. The currently served version is controlled by `backend/app/ml_models/cost_overrun/active.json`, hot-swappable via `POST /api/v1/ml/cost-overrun/versions/{version}/activate` — any past version can be reactivated without retraining.
- Training data blends a fixed synthetic baseline (1,000-row `cost_overrun_baseline.csv`, never mutated), real completed-project rows pulled from Supabase, and optional validated user-uploaded datasets (`cost_overrun_dataset_validator.py`).
- Every training run is recorded in a Supabase `ml_training_runs` table for auditability.
- `fallback_models_service.py` / `fallback_model_generator.py` provide safe default predictions when a trained model isn't available for a given project profile.

---

## Guardrails, Safety & Human-in-the-Loop

- **`app/core/guardrails.py`** — regex-based prompt-injection detection, PII masking, and safety-context disclaimers on AI responses.
- **`app/core/nemo_rails.py`** — Groq-based topical/jailbreak classifier (`ALLOWED` / `JAILBREAK` / `OFF_TOPIC`); a lightweight replacement for NeMo Guardrails due to a Python 3.14 incompatibility.
- **`app/core/llama_guard.py`** — LlamaGuard-3-8B (via Groq) content-safety classification against the S1–S13 hazard taxonomy.
- **`app/core/hitl.py`** — auto-queues high-risk AI outputs into a Supabase `ai_review_queue` table for human approval, surfaced through the `review` API router and the frontend's `review` dashboard page.
- **LLM-as-judge** (`app/ai/rubrics.py`, `hf_judge_client.py`, `judge.py`) — rubric-based scoring of AI outputs using a Hugging Face Qwen model, intentionally a different model family from the Groq/Llama generator to reduce self-preference bias.
- **Evaluation** (`evaluation.py`) — RAGAS and DeepEval integration for automated hallucination/answer-relevancy scoring.

---

## Data Layer

- **Primary database**: Supabase (managed Postgres) + Supabase Auth. Accessed through `app/core/database.py`; no local ORM layer — Supabase's client library is the source of truth for the API.
- **Cache / queue**: Redis — Celery broker and (optionally) distributed rate-limit state.
- **Vector store**: Chroma (`backend/data/mem0_chroma/`) backing the `mem0` long-term conversational memory integration; Zep is supported as an alternative self-hosted memory backend.
- **`ml/data/raw/`**: standalone CSV training datasets (see [Machine Learning](#machine-learning)).
- **Root `data/`**: reserved/placeholder mount point, currently empty.

---

## Docker

`docker-compose.yml` (repo root) defines three services for local development:

| Service | Build context | Port | Notes |
|---|---|---|---|
| `backend` | `./backend` | `8000:8000` | Env: `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `RESEND_API_KEY`, `CORS_ORIGINS`; depends on `redis` |
| `frontend` | `./frontend` | `3000:3000` | Build args: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`; depends on `backend` |
| `redis` | `redis:7-alpine` | `6379:6379` | Celery broker / rate limiting |

- `backend/Dockerfile` and `ml/Dockerfile` are multi-stage (builder + runner) and use `requirements.prod.txt` to exclude heavy training-only dependencies (torch, etc.) from the served image. `ml/Dockerfile` installs a CPU-only PyTorch wheel and exposes port `8001`.
- `frontend/Dockerfile` is a 3-stage pnpm build producing a static export (`/out`) served by the `serve` package on port `3000`.
- The `ml` service has its own Dockerfile but is **not** currently included in `docker-compose.yml` — it's intended to be run/deployed independently of the compose stack.

Run locally:
```bash
docker compose up --build
```

---

## Kubernetes

`k8s/` — production manifests, all in the `civilai` namespace, designed for GKE:

| File | Resource(s) | Purpose |
|---|---|---|
| `namespace.yaml` | `civilai` Namespace | isolates all CivilAI resources |
| `configmap.yaml` | `civilai-config` ConfigMap | `ENVIRONMENT`, `LOG_LEVEL`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL` |
| `secrets.yaml` | `civilai-secrets` Secret | `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (base64 placeholders — populate before applying) |
| `backend-deployment.yaml` | `backend` Deployment (2 replicas) + ClusterIP Service (80→8000) | readiness/liveness on `/health`; resources 500m/2Gi → 2 CPU/6Gi |
| `frontend-deployment.yaml` | `frontend` Deployment (2 replicas) + LoadBalancer Service (80→3000) | readiness/liveness on `/`; resources 250m/512Mi → 1 CPU/1Gi |
| `redis-deployment.yaml` | `redis` Deployment (1 replica) + ClusterIP Service (6379) | `redis-cli ping` exec readiness probe |
| `hpa.yaml` | `backend-hpa` (2–8 replicas, CPU 65% / mem 75%), `frontend-hpa` (2–6 replicas, CPU 70%) | `autoscaling/v2` HorizontalPodAutoscalers |
| `ingress.yaml` | `civilai-ingress` + `civilai-ssl` ManagedCertificate | GCE ingress class, static IP `civilai-ip`; routes `civilai.<domain>` → frontend, `api.civilai.<domain>` → backend |

Deploy:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml      # after populating real secret values
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml
```

There are currently no manifests for the standalone `ml/` service or for Celery workers — both run outside the k8s stack today.

---

## Cloud Deployment (GCP)

Full walkthrough in [`GCP_DEPLOY.md`](GCP_DEPLOY.md). Summary:

1. Enable required GCP APIs: `container`, `artifactregistry`, `cloudbuild`, `cloudresourcemanager`, `iam`.
2. Create an Artifact Registry repository named `civilai`.
3. Create a GKE cluster `civilai-cluster` (Autopilot, or a standard 2–6 node `e2-standard-2` autoscaling pool).
4. Build and push `backend` and `frontend` images to Artifact Registry.
5. Patch image references in the `k8s/` manifests to point at the pushed images.
6. Create the `civilai-secrets` Secret with real values.
7. `kubectl apply` the namespace, configmap, deployments, and HPAs.
8. Set up the GCE Ingress and reserve a static IP (`civilai-ip`).
9. Configure DNS for `civilai.<domain>` / `api.civilai.<domain>`.
10. Wire up Cloud Build CI/CD (`cloudbuild.yaml`) on pushes to `main`.

**`cloudbuild.yaml`** builds and tags backend/frontend images (`${SHORT_SHA}` and `latest`), pushes to Artifact Registry, fetches GKE credentials for `civilai-cluster`, then runs `kubectl set image` on the `backend` and `frontend` Deployments in the `civilai` namespace, waiting on rollout status (300s timeout). Runs on `E2_HIGHCPU_8`, overall 1800s timeout.

The backend image is kept lean via `requirements.prod.txt` (excludes torch/sentence-transformers/training-only deps, which otherwise balloon the image to 5–6 GB). Estimated GKE Autopilot cost: **~$80–85/month** (cluster ~$60, Artifact Registry ~$1, Cloud Build ~$0–5, Load Balancer ~$18) — a $300 GCP free trial covers roughly 3.5 months.

---

## CI/CD

- **`.github/workflows/ml_pipeline.yml`** — "CivilAI ML Pipeline" GitHub Action. Triggers on pushes to `ml/**`, a weekly Sunday cron, and manual dispatch. Pipeline: generate/refresh data → MLflow-tracked training → Prefect pipeline run → drift detection → performance monitoring → quality gate (fails the build if `avg_accuracy < 0.70`) → upload MLflow artifacts and trained model files.
- **Google Cloud Build** (`cloudbuild.yaml`) — builds, pushes, and deploys backend/frontend images to GKE on pushes to `main` (see above).
- No dedicated backend/frontend unit-test CI workflow currently exists; see [Testing & Evaluation](#testing--evaluation-notes) below.

### Testing & Evaluation notes

- Backend: no dedicated `tests/` directory; ad hoc scripts at `backend/` root (`test_guardrails.py`, `test_imports.py`, `test_judge.py`).
- `.deepeval/` is the local cache/config directory created by the `deepeval` package, used by the `/api/v1/evaluation/deepeval` and `/batch` endpoints for hallucination/answer-relevancy scoring of AI outputs — it's a library artifact, not a test suite.
- RAGAS is used similarly via `/api/v1/evaluation/ragas`.
- Frontend currently has ESLint configured but no test runner wired up.

---

## Environment Variables

`backend/.env.example` covers the minimum required to run locally:

```env
GROQ_API_KEY=gsk_...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
RESEND_API_KEY=re_...
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:3000
CELERY_BROKER_URL=redis://localhost:6379/0
```

The full settings model (`backend/app/config.py`, pydantic-settings) supports additional variables:

| Variable | Purpose |
|---|---|
| `APP_NAME` | defaults to `"CivilAI"` |
| `DEBUG`, `ALLOWED_ORIGINS` | app/CORS config |
| `GROQ_API_KEY_2` / `GROQ_API_KEY_3` | fallback Groq keys, rotated on daily-limit errors |
| `GEMINI_API_KEY` | required — Groq fallback LLM provider |
| `SUPABASE_SECRET_KEY` | required — service-role Supabase key |
| `HUGGINGFACE_TOKEN` | required — judge model + LlamaGuard |
| `JUDGE_HF_MODEL` | optional override for the LLM-as-judge model |
| `REDIS_URL` | optional — enables distributed rate limiting |
| `ELEVENLABS_API_KEY` | optional — premium TTS (default: Groq PlayAI) |
| `MEM0_API_KEY` | optional — hosted mem0 (default: local Groq + Chroma) |
| `ZEP_BASE_URL` / `ZEP_API_KEY` | optional — self-hosted Zep memory backend |
| `AUTH_REQUIRED` | gates `/financials`, `/payments`, `/vendors`, `/contracts` behind auth |
| `LANGCHAIN_TRACING_V2` / `LANGCHAIN_API_KEY` / `LANGCHAIN_PROJECT` | LangSmith tracing |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry export target |
| `PVPORCUPINE_ACCESS_KEY` | Picovoice wake-word for the voice bot |

Frontend build-time variables (baked into the static export): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.

> Never commit real `.env` files. `backend/.env`, `frontend/.env.development.local`, `frontend/.env.production`, and `ml/.env` are local-only and gitignored.

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js + pnpm
- Docker & Docker Compose (recommended for local dev)
- A Supabase project (Postgres + Auth)
- API keys: Groq (required), Gemini (fallback), Hugging Face (judge/guard models)

### Option A — Docker Compose (recommended)
```bash
cp backend/.env.example backend/.env   # fill in real values
docker compose up --build
```
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000 (docs at `/docs`)
- Redis: localhost:6379

### Option B — Run services natively

**Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env         # fill in real values
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
pnpm install
pnpm dev                     # http://localhost:3000
```

**Standalone MCP server** (for use with Claude Desktop / Claude Code):
```bash
cd backend
venv\Scripts\python.exe app\mcp\server.py
```
Or reference it directly via `.mcp.json` at the repo root, which is already configured for this project.

**ML training pipeline** (optional, standalone):
```bash
cd ml
pip install -r requirements.txt
python data/download_data.py
python models/train_all.py
```

---

## Project Structure

```
CivilAI/
├── .mcp.json                  # MCP server registrations (playwright, supabase, civilai)
├── docker-compose.yml         # local dev stack: backend, frontend, redis
├── cloudbuild.yaml            # GCP Cloud Build → GKE deploy pipeline
├── GCP_DEPLOY.md              # step-by-step GKE deployment guide
├── backend/
│   ├── main.py                # FastAPI app entrypoint
│   ├── app/
│   │   ├── ai/                # LLM agents, analyzers, RAG, memory, voice
│   │   ├── api/v1/routes/     # 33 domain route modules
│   │   ├── core/               # db, auth/security, guardrails, HITL, telemetry
│   │   ├── mcp/server.py      # MCP server (FastMCP)
│   │   ├── ml_models/          # versioned cost-overrun model store
│   │   ├── services/            # BIM, ML, cache, storage, structural, voice
│   │   └── scripts/            # data export, fallback model gen, seeding
│   └── Dockerfile
├── frontend/
│   ├── src/app/(dashboard)/   # 40+ dashboard feature pages
│   └── Dockerfile
├── ml/
│   ├── api/main.py            # standalone ML FastAPI service (port 8001)
│   ├── data/raw/               # training datasets
│   ├── models/                 # train_all.py, gnn_risk.py
│   ├── pipelines/               # Prefect training pipeline
│   ├── monitoring/              # drift/performance monitoring
│   └── mlruns/                  # MLflow experiment tracking store
├── k8s/                        # Kubernetes manifests (namespace: civilai)
├── docker/                     # (reserved)
├── data/                       # (reserved, empty)
└── .github/workflows/
    └── ml_pipeline.yml         # scheduled ML training/validation pipeline
```
