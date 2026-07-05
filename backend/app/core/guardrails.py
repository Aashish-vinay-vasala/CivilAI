import re
import logging

logger = logging.getLogger("civilai.guardrails")

# Prompt injection patterns to block
_INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|prior)\s+instructions?",
    r"forget\s+(everything|all|your|the)\s+(previous|instructions?|context|training)",
    r"you\s+are\s+now\s+a?n?\s+\w+",
    r"act\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?\w+",
    r"jailbreak",
    r"disregard\s+(your|all|the|previous)\s+(rules?|instructions?|guidelines?|constraints?)",
    r"pretend\s+(you\s+are|to\s+be)",
    r"simulate\s+(being|a|an)",
    r"role-?play\s+as",
    r"system\s*:\s*you\s+are",
    r"<\s*/?system\s*>",
    r"\[system\]",
    r"##\s*instruction",
    r"new\s+prompt\s*:",
    r"override\s+(safety|restrictions?|rules?)",
]

_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]

MAX_PROMPT_LENGTH = 4000
MAX_TRANSCRIPT_LENGTH = 50_000   # meeting transcripts / large documents
MAX_RESPONSE_LENGTH = 12000

_SAFETY_CONTEXTS = {"safety", "hazard", "incident", "injury", "osha", "emergency", "accident"}
_SAFETY_DISCLAIMER = (
    "\n\n*This AI analysis is advisory only. Always follow official OSHA guidelines "
    "and consult qualified safety professionals before acting on this information.*"
)


def sanitize_prompt(text: str, max_length: int = MAX_PROMPT_LENGTH) -> tuple[str, list[str]]:
    """
    Sanitize user input before sending to an LLM.

    Returns (cleaned_text, warnings). Raises ValueError if prompt injection is detected.
    """
    warnings: list[str] = []

    if not text or not text.strip():
        raise ValueError("Input cannot be empty")

    if len(text) > max_length:
        text = text[:max_length]
        warnings.append(f"Input was truncated to {max_length:,} characters")
        logger.warning("Input truncated | max_length=%d", max_length)

    for pattern in _COMPILED_PATTERNS:
        if pattern.search(text):
            logger.warning("Prompt injection blocked | pattern=%s | snippet=%.80r",
                           pattern.pattern, text)
            raise ValueError(
                "Your message contains patterns that look like prompt injection. "
                "Please rephrase and try again."
            )

    # Strip null bytes and non-printable control characters (keep \n \t \r)
    cleaned = re.sub(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]", "", text)
    if cleaned != text:
        warnings.append("Non-printable characters were removed from the input")
        logger.warning("Control characters stripped from input")

    return cleaned, warnings


def validate_output(response: str, context: str = "") -> tuple[str, bool]:
    """
    Validate and post-process an AI response.

    Returns (processed_response, is_valid). Appends a safety disclaimer when the
    user's context is safety-critical.
    """
    if not response or not response.strip():
        logger.warning("Empty AI response detected")
        return "I was unable to generate a response. Please try again.", False

    if len(response) > MAX_RESPONSE_LENGTH:
        response = response[:MAX_RESPONSE_LENGTH] + "\n\n[Response truncated due to length]"
        logger.warning("AI response truncated | length=%d", len(response))

    context_lower = context.lower()
    if any(kw in context_lower for kw in _SAFETY_CONTEXTS):
        if _SAFETY_DISCLAIMER.strip() not in response:
            response += _SAFETY_DISCLAIMER

    return response, True


# ---------------------------------------------------------------------------
# RBAC — role-to-module permission map
# ---------------------------------------------------------------------------

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "project_director": {
        "copilot", "documents", "contracts", "safety", "cost", "schedule",
        "workforce", "procurement", "compliance", "equipment", "reports",
        "ml", "projects", "writing", "green", "vendors", "payments",
        "bim", "construction", "transcribe", "email", "preconstruction", "financials",
    },
    "admin": {
        "copilot", "documents", "contracts", "safety", "cost", "schedule",
        "workforce", "procurement", "compliance", "equipment", "reports",
        "ml", "projects", "writing", "green", "vendors", "payments",
        "bim", "construction", "transcribe", "email", "preconstruction", "financials",
    },
    "engineer": {
        "copilot", "documents", "safety", "schedule", "equipment", "reports",
        "ml", "projects", "bim", "construction", "compliance", "writing", "transcribe",
    },
    "contractor": {
        "copilot", "documents", "safety", "schedule", "equipment",
        "projects", "construction", "compliance", "writing",
    },
}


def has_permission(role: str, module: str) -> bool:
    """Return True if the given role may access the named module."""
    return module in ROLE_PERMISSIONS.get(role.lower(), set())


def guard_text(
    text: str,
    use_llamaguard: bool = False,
    max_length: int = MAX_PROMPT_LENGTH,
) -> tuple[str, list[str]]:
    """
    Shared input guardrail for any free-text field.

    Args:
        text:           The user-supplied string to guard.
        use_llamaguard: Also run LlamaGuard content screening (adds ~1s latency).
        max_length:     Character cap before truncation. Use MAX_TRANSCRIPT_LENGTH
                        for meeting transcripts or other large free-text fields.

    Returns (clean_text, warnings). Raises ValueError if blocked.
    """
    clean, warnings = sanitize_prompt(text, max_length=max_length)

    if use_llamaguard:
        from app.core.llama_guard import check_input
        is_safe, violation = check_input(clean)
        if not is_safe:
            logger.warning("LlamaGuard blocked input | violation=%s", violation)
            raise ValueError(
                f"Your message was blocked by content policy: {violation}. "
                "Please rephrase and try again."
            )

    return clean, warnings
