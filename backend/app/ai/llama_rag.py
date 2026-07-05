"""
LlamaIndex RAG pipeline — higher-quality document retrieval for CivilAI.

Provides node-level chunking, HuggingFace embeddings, and Groq LLM synthesis
as a drop-in alternative to the LangChain/Chroma pipeline in documents.py.

Required packages (all free / open-source):
  llama-index-core
  llama-index-llms-groq
  llama-index-embeddings-huggingface  (uses sentence-transformers, already installed)

Required env vars:
  GROQ_API_KEY   (shared with existing analyzers)

Optional:
  LLAMA_EMBED_MODEL   HuggingFace model name (default: BAAI/bge-small-en-v1.5)
  LLAMA_LLM_MODEL     Groq model name       (default: llama-3.3-70b-versatile)
"""
import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger("civilai.llama_rag")

_EMBED_MODEL = os.getenv("LLAMA_EMBED_MODEL", "BAAI/bge-small-en-v1.5")
_LLM_MODEL   = os.getenv("LLAMA_LLM_MODEL",  "llama-3.3-70b-versatile")


_settings_configured = False


def _configure_settings() -> bool:
    """
    Configure LlamaIndex global Settings with Groq + HuggingFace.
    Returns True if successful, False if llama-index is not installed.
    Idempotent — configures once per process.
    """
    global _settings_configured
    if _settings_configured:
        return True
    try:
        from llama_index.core import Settings
        from llama_index.llms.groq import Groq as LlamaGroq
        from llama_index.embeddings.huggingface import HuggingFaceEmbedding

        Settings.llm          = LlamaGroq(model=_LLM_MODEL, api_key=os.getenv("GROQ_API_KEY", ""))
        Settings.embed_model  = HuggingFaceEmbedding(model_name=_EMBED_MODEL)
        Settings.chunk_size   = 512
        Settings.chunk_overlap = 50
        _settings_configured  = True
        return True
    except ImportError as exc:
        logger.warning("llama-index not available: %s", exc)
        return False
    except Exception as exc:
        logger.error("LlamaIndex settings configuration failed: %s", exc)
        return False


def build_index(texts: list[str]) -> Optional[object]:
    """
    Build an in-memory VectorStoreIndex from a list of text strings.
    Returns the index object or None if llama-index is not installed.

    Each string is wrapped in a Document; LlamaIndex handles chunking and
    embedding automatically according to the configured Settings.
    """
    if not _configure_settings():
        return None
    try:
        from llama_index.core import VectorStoreIndex, Document
        docs = [Document(text=t) for t in texts if t.strip()]
        if not docs:
            return None
        return VectorStoreIndex.from_documents(docs)
    except Exception as exc:
        logger.error("LlamaIndex build_index failed: %s", exc)
        return None


def query_index(index: Optional[object], question: str, top_k: int = 3) -> str:
    """
    Query a VectorStoreIndex and return the LLM-synthesised answer.
    Returns an empty string when index is None or the query fails.
    """
    if index is None:
        return ""
    try:
        engine = index.as_query_engine(similarity_top_k=top_k)  # type: ignore[union-attr]
        result = engine.query(question)
        return str(result)
    except Exception as exc:
        logger.error("LlamaIndex query failed: %s", exc)
        return ""


async def rag_answer(texts: list[str], question: str, top_k: int = 3) -> dict:
    """
    One-shot coroutine: index the given texts, retrieve relevant chunks, and
    synthesise an answer using the Groq LLM.

    Returns:
      {
        "answer":       str   — LLM-synthesised answer
        "source_count": int   — number of documents indexed
        "engine":       str   — "llama-index"
      }
    """
    loop  = asyncio.get_event_loop()
    index = await loop.run_in_executor(None, build_index, texts)
    if index is None:
        return {
            "answer":       "LlamaIndex RAG not available. Check installation.",
            "source_count": 0,
            "engine":       "llama-index",
        }
    answer = await loop.run_in_executor(None, query_index, index, question, top_k)
    return {
        "answer":       answer or "No relevant information found in the provided documents.",
        "source_count": len(texts),
        "engine":       "llama-index",
    }
