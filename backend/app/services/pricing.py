"""
Per-model $/1M-token rates for estimating ai_usage_log's cost_usd column.
Sourced from console.groq.com/docs/models and public Gemini API pricing as
of 2026-08 — providers change prices without notice, so treat this as a
running estimate for visibility, not a billing-accurate record. Unknown
models return None rather than guessing.
"""

# (provider, model) -> (input $/1M tokens, output $/1M tokens)
_RATES: dict[tuple[str, str], tuple[float, float]] = {
    ("groq", "llama-3.3-70b-versatile"):      (0.59, 0.79),
    ("groq", "llama-3.1-8b-instant"):         (0.05, 0.08),
    ("groq", "openai/gpt-oss-120b"):          (0.15, 0.60),
    ("groq", "openai/gpt-oss-20b"):           (0.075, 0.30),
    ("groq", "openai/gpt-oss-safeguard-20b"): (0.075, 0.30),
    ("groq", "qwen/qwen3.6-27b"):             (0.60, 3.00),
    ("gemini", "gemini-2.0-flash"):           (0.10, 0.40),
}


def estimate_cost(
    provider: str,
    model: str | None,
    total_tokens: int,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> float | None:
    """Best-effort USD estimate for one call. None when the model isn't in
    the table above (unrecognized model, or a non-token-priced one like
    Whisper's per-hour audio rate) — callers should leave cost_usd null
    rather than show a fabricated number."""
    if not model:
        return None
    rates = _RATES.get((provider, model))
    if rates is None:
        return None
    in_rate, out_rate = rates
    if input_tokens is not None and output_tokens is not None:
        return round(input_tokens / 1_000_000 * in_rate + output_tokens / 1_000_000 * out_rate, 6)
    # No input/output split available — approximate with the blended rate.
    blended = (in_rate + out_rate) / 2
    return round(total_tokens / 1_000_000 * blended, 6)
