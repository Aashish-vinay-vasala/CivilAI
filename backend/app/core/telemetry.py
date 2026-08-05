"""
Observability bootstrap — called once at startup from main.py.

LangSmith:      Set LANGCHAIN_TRACING_V2=true + LANGCHAIN_API_KEY in .env
                Every function decorated with @traceable appears in the dashboard.

OpenTelemetry:  Set OTEL_EXPORTER_OTLP_ENDPOINT to your collector (Jaeger / Grafana Tempo).
                Falls back to a console exporter so spans are never silently dropped.
                FastAPI HTTP spans are auto-instrumented when the package is present.
"""
import logging
import os

logger = logging.getLogger("civilai.telemetry")


def setup_otel(service_name: str = "civilai-backend") -> None:
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

        resource = Resource.create({"service.name": service_name, "service.version": "1.0.0"})
        provider = TracerProvider(resource=resource)

        endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
        if endpoint:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            exporter = OTLPSpanExporter(endpoint=endpoint, insecure=not endpoint.startswith("https"))
            logger.info("OTel → OTLP at %s", endpoint)
        else:
            exporter = ConsoleSpanExporter()
            logger.info("OTel → console (set OTEL_EXPORTER_OTLP_ENDPOINT for production)")

        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            FastAPIInstrumentor().instrument()
            logger.info("OTel FastAPI instrumentation active")
        except ImportError:
            pass

    except Exception as exc:
        logger.warning("OpenTelemetry setup failed (non-fatal): %s", exc)


def setup_langsmith() -> bool:
    # pydantic-settings reads .env into `settings` but never mirrors those values
    # into os.environ — and both os.getenv() below and the langsmith SDK's own
    # @traceable decorator read os.environ directly, so without this the .env
    # config is silently ignored and no traces are ever sent.
    from app.config import settings

    if not settings.LANGCHAIN_TRACING_V2:
        return False
    if not settings.LANGCHAIN_API_KEY:
        logger.warning("LANGCHAIN_TRACING_V2=true but LANGCHAIN_API_KEY not set — tracing disabled")
        return False

    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.LANGCHAIN_API_KEY
    os.environ["LANGCHAIN_PROJECT"] = settings.LANGCHAIN_PROJECT

    logger.info("LangSmith tracing enabled | project=%s", settings.LANGCHAIN_PROJECT)
    return True


def setup_all() -> None:
    setup_langsmith()
    setup_otel()
