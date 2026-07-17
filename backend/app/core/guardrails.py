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

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]")

# PII patterns to mask before persisting free text to any long-term store
# (chat history, mem0/Zep memory). Deliberately conservative — false positives
# just mask a few extra digits, false negatives leak real PII, so patterns
# lean broad.
_PII_PATTERNS = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),                              # SSN: 123-45-6789
    (re.compile(r"\b(?:\d[ -]*?){13,16}\b"), "[CARD]"),                            # credit card, 13-16 digits
    (re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b"), "[PHONE]"),  # US phone
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"), "[EMAIL]"),                      # email
]


def clean_field(text: str, max_length: int = 500) -> str:
    """
    Lightweight guard for structured tool/API arguments (not conversational
    prompts) — strips control characters and caps length. Unlike
    sanitize_prompt(), this does NOT run the injection-pattern block, since
    legitimate field values (incident descriptions, punch-list items, etc.)
    can contain words like "override" or "system" without being an attack.
    """
    if not text:
        return text
    cleaned = _CONTROL_CHARS_RE.sub("", text).strip()
    return cleaned[:max_length]


def redact_pii(text: str) -> str:
    """Mask SSNs, credit-card-like numbers, phone numbers, and emails in text
    before it's written to any persistent store (chat history, long-term
    memory). Does not affect what's sent to the LLM in the current turn."""
    if not text:
        return text
    redacted = text
    for pattern, placeholder in _PII_PATTERNS:
        redacted = pattern.sub(placeholder, redacted)
    return redacted


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
        "chatbot", "voice", "agent", "support", "review", "evaluation", "accounting",
        "notifications", "tenders",
    },
    "admin": {
        "copilot", "documents", "contracts", "safety", "cost", "schedule",
        "workforce", "procurement", "compliance", "equipment", "reports",
        "ml", "projects", "writing", "green", "vendors", "payments",
        "bim", "construction", "transcribe", "email", "preconstruction", "financials",
        "chatbot", "voice", "agent", "support", "review", "evaluation", "accounting",
        "notifications", "tenders",
    },
    "engineer": {
        "copilot", "documents", "safety", "schedule", "equipment", "reports",
        "ml", "projects", "bim", "construction", "compliance", "writing", "transcribe",
        "chatbot", "voice", "agent", "support", "notifications", "tenders", "workforce",
    },
    "contractor": {
        "copilot", "documents", "safety", "schedule", "equipment",
        "projects", "construction", "compliance", "writing",
        "chatbot", "voice", "agent", "support", "notifications", "tenders", "workforce", "ml",
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
