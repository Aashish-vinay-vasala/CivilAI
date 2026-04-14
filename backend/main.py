from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.v1.routes import copilot, documents, contracts, safety, cost, schedule, workforce, procurement, compliance, equipment, reports, ml, projects, writing

app = FastAPI(
    title="CivilAI API",
    description="AI-Powered Construction Management Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    copilot.router,
    prefix="/api/v1/copilot",
    tags=["Copilot"]
)

app.include_router(
    projects.router,
    prefix="/api/v1/projects",
    tags=["Projects"]
)

app.include_router(
    ml.router,
    prefix="/api/v1/ml",
    tags=["ML Predictions"]
)

app.include_router(
    documents.router,
    prefix="/api/v1/documents",
    tags=["Documents"]
)

app.include_router(
    writing.router,
    prefix="/api/v1/writing",
    tags=["Writing Assistant"]
)

app.include_router(
    contracts.router,
    prefix="/api/v1/contracts",
    tags=["Contracts"]
)

app.include_router(
    safety.router,
    prefix="/api/v1/safety",
    tags=["Safety"]
)

app.include_router(
    cost.router,
    prefix="/api/v1/cost",
    tags=["Cost"]
)

app.include_router(
    schedule.router,
    prefix="/api/v1/schedule",
    tags=["Schedule"]
)

app.include_router(
    workforce.router,
    prefix="/api/v1/workforce",
    tags=["Workforce"]
)

app.include_router(
    procurement.router,
    prefix="/api/v1/procurement",
    tags=["Procurement"]
)

app.include_router(
    compliance.router,
    prefix="/api/v1/compliance",
    tags=["Compliance"]
)

app.include_router(
    equipment.router,
    prefix="/api/v1/equipment",
    tags=["Equipment"]
)

app.include_router(
    reports.router,
    prefix="/api/v1/reports",
    tags=["Reports"]
)

@app.get("/")
def read_root():
    return {
        "message": "CivilAI Backend Running!",
        "version": "1.0.0",
        "status": "active"
    }

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "debug": settings.DEBUG
    }