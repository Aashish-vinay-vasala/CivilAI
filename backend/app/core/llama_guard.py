"""
Content-safety classifier via Groq API.

Groq decommissioned llama-guard-3-8b (and its would-be successor
meta-llama/llama-guard-4-12b) — as of this writing neither is available on
the platform. openai/gpt-oss-safeguard-20b is the only safety-classifier-
shaped model Groq still hosts, but unlike LlamaGuard it's a policy-following
reasoning model: handed a bare message with no system prompt it just answers
the question instead of classifying it. So this module now supplies an
explicit moderation policy (the same S1-S13 taxonomy LlamaGuard used, so
_CATEGORIES/_parse_result's shape barely changed) and asks for compact JSON
output. reasoning_effort="low" keeps the chain-of-thought short enough that
it reliably finishes within max_tokens instead of getting cut off mid-JSON
(see json_validate_failed errors during testing at lower token budgets).
"""
import json
import logging

from groq import Groq
from app.config import settings
from app.ai.groq_client import call_with_retry

logger = logging.getLogger("civilai.llama_guard")

_MODEL = "openai/gpt-oss-safeguard-20b"

_POLICY_PROMPT = """You are a content-safety classifier for CivilAI, a construction \
project management platform.

Instructions: Classify the given message as SAFE or UNSAFE.

Criteria: Normal construction-management content — costs, schedules, safety incidents, \
contracts, workforce, BIM, procurement, compliance, equipment, or general domain \
questions — is always SAFE, even when discussing injuries, hazards, or incidents in a \
professional reporting context. Only classify UNSAFE if the message itself requests or \
contains genuinely harmful content under one of these categories:

S1 Violent Crimes, S2 Non-Violent Crimes, S3 Sex-Related Crimes, S4 Child Sexual \
Exploitation, S5 Defamation, S6 Specialized Advice (legal/medical/financial presented as \
professional counsel), S7 Privacy Violation, S8 Intellectual Property, S9 Weapons of Mass \
Destruction, S10 Hate Speech, S11 Suicide & Self-Harm, S12 Sexual Content, S13 Elections.

Respond with ONLY a JSON object, no other text: {"violation": 0 or 1, "category": "S1"-"S13" or null}"""

# Returned as the violation label when fail_closed=True and the LlamaGuard call
# itself errors out — distinguishes "check couldn't run" from "check ran and found
# a violation" so callers/logs don't conflate an outage with an actual policy hit.
GUARDRAIL_UNAVAILABLE_REASON = "content-safety check temporarily unavailable"

# LlamaGuard 3 hazard taxonomy
_CATEGORIES: dict[str, str] = {
    "S1":  "Violent Crimes",
    "S2":  "Non-Violent Crimes",
    "S3":  "Sex-Related Crimes",
    "S4":  "Child Sexual Exploitation",
    "S5":  "Defamation",
    "S6":  "Specialized Advice (legal / medical / financial)",
    "S7":  "Privacy Violation",
    "S8":  "Intellectual Property",
    "S9":  "Weapons of Mass Destruction",
    "S10": "Hate Speech",
    "S11": "Suicide & Self-Harm",
    "S12": "Sexual Content",
    "S13": "Elections",
}

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


def _parse_result(raw: str) -> tuple[bool, str | None]:
    """Parse the classifier's {"violation": 0|1, "category": "S1".."S13"|null} JSON
    into (is_safe, human_readable_category). Malformed JSON is treated as a
    classifier error (raises) so callers' existing except/fail-closed handling
    covers it too, rather than silently defaulting to safe or unsafe."""
    obj = json.loads(raw)
    if not obj.get("violation"):
        return True, None
    code = str(obj.get("category") or "").strip().upper()
    label = _CATEGORIES.get(code, f"Policy violation ({code})" if code else "Policy violation")
    return False, label


def check_input(user_message: str, fail_closed: bool = False) -> tuple[bool, str | None]:
    """
    Screen a user message before it reaches the main LLM.

    Returns (is_safe, violation_label). By default fails open on API errors
    (a guardrail outage must not block legitimate users on low-stakes routes).
    Pass fail_closed=True for routes that can trigger writes/side effects
    (e.g. the agent's log_safety_incident tool), where blocking on an outage
    is safer than letting an unscreened message through.
    """
    try:
        response = call_with_retry(lambda: _get_client().chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _POLICY_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=1024,
            temperature=0,
            reasoning_effort="low",
            response_format={"type": "json_object"},
        ))
        return _parse_result(response.choices[0].message.content)
    except Exception as exc:
        if fail_closed:
            logger.warning("Content-safety check_input unavailable, failing closed | error=%s", exc)
            return False, GUARDRAIL_UNAVAILABLE_REASON
        return True, None


def check_output(user_message: str, assistant_response: str, fail_closed: bool = False) -> tuple[bool, str | None]:
    """
    Screen the assistant's response before it reaches the user.

    Returns (is_safe, violation_label). Same fail-open/fail-closed behaviour
    as check_input — see that docstring.
    """
    try:
        response = call_with_retry(lambda: _get_client().chat.completions.create(
            model=_MODEL,
            messages=[
                {"role": "system", "content": _POLICY_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Classify the ASSISTANT reply below, using the USER message only "
                        f"as context for what prompted it.\n\nUSER: {user_message}\n\n"
                        f"ASSISTANT: {assistant_response}"
                    ),
                },
            ],
            max_tokens=1024,
            temperature=0,
            reasoning_effort="low",
            response_format={"type": "json_object"},
        ))
        return _parse_result(response.choices[0].message.content)
    except Exception as exc:
        if fail_closed:
            logger.warning("Content-safety check_output unavailable, failing closed | error=%s", exc)
            return False, GUARDRAIL_UNAVAILABLE_REASON
        return True, None
