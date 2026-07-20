# ── Stage 1: builder (install deps) ───────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.prod.txt ./

# --extra-index-url pulls the CPU-only torch wheel (hundreds of MB instead of the
# multi-GB default CUDA build) while everything else still resolves from PyPI.
RUN pip install --prefix=/install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.prod.txt

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM python:3.11-slim AS runner

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

RUN addgroup --system --gid 1001 appgroup && adduser --system --uid 1001 --ingroup appgroup appuser

COPY --from=builder /install /usr/local
COPY --chown=appuser:appgroup . .

USER appuser
EXPOSE 8001
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8001} --workers 1"]
