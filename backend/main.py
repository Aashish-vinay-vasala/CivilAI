import asyncio
import logging
import sys
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.telemetry import setup_all
from app.core.security import require_module_access
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.api.v1.routes import copilot, chatbot, documents, contracts, safety, cost, schedule, workforce, procurement, compliance, equipment, reports, ml, projects, writing, green, vendors, payments, bim, construction, transcribe, email_notifications, preconstruction, financials, review, support, voice, agent, evaluation, accounting, notifications, tenders, material_prices

setup_all()   # boot LangSmith tracing + OTel before the app object is created

logger = logging.getLogger("civilai.main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    scheduler = None
    if settings.MATERIAL_PRICE_SYNC_ENABLED and settings.FRED_API_KEY:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from app.services.material_price_sync import sync_all_material_prices

        async def _run_sync():
            try:
                result = await sync_all_material_prices()
                logger.info("Material price sync completed: %s", result)
            except Exception:
                logger.exception("Scheduled material price sync failed")

        scheduler = AsyncIOScheduler()
        scheduler.add_job(
            _run_sync,
            "interval",
            hours=settings.MATERIAL_PRICE_SYNC_INTERVAL_HOURS,
            id="material_price_sync",
        )
        scheduler.start()
        logger.info(
            "Material price sync scheduler started (every %sh)",
            settings.MATERIAL_PRICE_SYNC_INTERVAL_HOURS,
        )
    elif settings.MATERIAL_PRICE_SYNC_ENABLED and not settings.FRED_API_KEY:
        logger.warning("MATERIAL_PRICE_SYNC_ENABLED is true but FRED_API_KEY is unset — sync will not run")

    yield

    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="CivilAI API",
    description="AI-Powered Construction Management Platform",
    version="1.0.0",
    lifespan=lifespan,
)

_origins = settings.get_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials="*" not in _origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimiterMiddleware)

# NOTE: copilot and support are intentionally NOT module-gated here — both
# have endpoints designed to work for anonymous/optional-auth users
# (get_optional_user), and already apply their own finer-grained protect_route
# checks internally where needed. A blanket module gate would break that.

app.include_router(
    copilot.router,
    prefix="/api/v1/copilot",
    tags=["Copilot"]
)

app.include_router(
    chatbot.router,
    prefix="/api/v1/chatbot",
    tags=["Chatbot"],
    dependencies=[Depends(require_module_access("chatbot"))],
)

app.include_router(
    construction.router,
    prefix="/api/v1/construction",
    tags=["Construction Management"],
    dependencies=[Depends(require_module_access("construction"))],
)

app.include_router(
    payments.router,
    prefix="/api/v1/payments",
    tags=["Payment Tracker"],
    dependencies=[Depends(require_module_access("payments"))],
)

app.include_router(
    projects.router,
    prefix="/api/v1/projects",
    tags=["Projects"],
    dependencies=[Depends(require_module_access("projects"))],
)

app.include_router(
    vendors.router,
    prefix="/api/v1/vendors",
    tags=["Vendor Scoring"],
    dependencies=[Depends(require_module_access("vendors"))],
)

app.include_router(
    green.router,
    prefix="/api/v1/green",
    tags=["Green Monitor"],
    dependencies=[Depends(require_module_access("green"))],
)

app.include_router(
    ml.router,
    prefix="/api/v1/ml",
    tags=["ML Predictions"],
    dependencies=[Depends(require_module_access("ml"))],
)

app.include_router(
    material_prices.router,
    prefix="/api/v1/material-prices",
    tags=["Material Prices"],
    dependencies=[Depends(require_module_access("ml"))],
)

app.include_router(
    documents.router,
    prefix="/api/v1/documents",
    tags=["Documents"],
    dependencies=[Depends(require_module_access("documents"))],
)

app.include_router(
    writing.router,
    prefix="/api/v1/writing",
    tags=["Writing Assistant"],
    dependencies=[Depends(require_module_access("writing"))],
)

app.include_router(
    contracts.router,
    prefix="/api/v1/contracts",
    tags=["Contracts"],
    dependencies=[Depends(require_module_access("contracts"))],
)

app.include_router(
    safety.router,
    prefix="/api/v1/safety",
    tags=["Safety"],
    dependencies=[Depends(require_module_access("safety"))],
)

app.include_router(
    cost.router,
    prefix="/api/v1/cost",
    tags=["Cost"],
    dependencies=[Depends(require_module_access("cost"))],
)

app.include_router(
    schedule.router,
    prefix="/api/v1/schedule",
    tags=["Schedule"],
    dependencies=[Depends(require_module_access("schedule"))],
)

app.include_router(
    workforce.router,
    prefix="/api/v1/workforce",
    tags=["Workforce"],
    dependencies=[Depends(require_module_access("workforce"))],
)

app.include_router(
    procurement.router,
    prefix="/api/v1/procurement",
    tags=["Procurement"],
    dependencies=[Depends(require_module_access("procurement"))],
)

app.include_router(
    compliance.router,
    prefix="/api/v1/compliance",
    tags=["Compliance"],
    dependencies=[Depends(require_module_access("compliance"))],
)

app.include_router(
    equipment.router,
    prefix="/api/v1/equipment",
    tags=["Equipment"],
    dependencies=[Depends(require_module_access("equipment"))],
)

app.include_router(
    reports.router,
    prefix="/api/v1/reports",
    tags=["Reports"],
    dependencies=[Depends(require_module_access("reports"))],
)

app.include_router(
    bim.router,
    prefix="/api/v1/bim",
    tags=["BIM & CAD"],
    dependencies=[Depends(require_module_access("bim"))],
)

app.include_router(
    transcribe.router,
    prefix="/api/v1/transcribe",
    tags=["Transcription"],
    dependencies=[Depends(require_module_access("transcribe"))],
)

app.include_router(
    email_notifications.router,
    prefix="/api/v1/email",
    tags=["Email Notifications"],
    dependencies=[Depends(require_module_access("email"))],
)

app.include_router(
    preconstruction.router,
    prefix="/api/v1/preconstruction",
    tags=["Pre-Construction"],
    dependencies=[Depends(require_module_access("preconstruction"))],
)

app.include_router(
    financials.router,
    prefix="/api/v1/financials",
    tags=["Financial Budget"],
    dependencies=[Depends(require_module_access("financials"))],
)

app.include_router(
    review.router,
    prefix="/api/v1/review",
    tags=["Human Review Queue"],
    dependencies=[Depends(require_module_access("review"))],
)

app.include_router(
    support.router,
    prefix="/api/v1/support",
    tags=["Customer Support"]
)

app.include_router(
    voice.router,
    prefix="/api/v1/voice",
    tags=["Voice Bot"],
    dependencies=[Depends(require_module_access("voice"))],
)

app.include_router(
    agent.router,
    prefix="/api/v1/agent",
    tags=["AI Agent"],
    dependencies=[Depends(require_module_access("agent"))],
)

app.include_router(
    evaluation.router,
    prefix="/api/v1/evaluation",
    tags=["AI Evaluation"],
    dependencies=[Depends(require_module_access("evaluation"))],
)

app.include_router(
    accounting.router,
    prefix="/api/v1/accounting",
    tags=["Accounting Extraction"],
    dependencies=[Depends(require_module_access("accounting"))],
)

app.include_router(
    notifications.router,
    prefix="/api/v1/notifications",
    tags=["Notifications"],
    dependencies=[Depends(require_module_access("notifications"))],
)

app.include_router(
    tenders.router,
    prefix="/api/v1/tenders",
    tags=["Tenders"],
    dependencies=[Depends(require_module_access("tenders"))],
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

if __name__ == "__main__":
    import os
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))