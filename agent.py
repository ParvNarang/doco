# agent.py
"""
Agent logic for the collaborative editor.
Two-phase: cheap classification -> full RAG-grounded generation.
All LLM calls go through local Ollama. No external API calls.
"""

import json
import re
import uuid
import os
import time
import logging
from typing import Generator
from langchain_ollama import ChatOllama
import rag as rag_module
from config import settings

log = logging.getLogger("agent")

DEFAULT_MODEL = settings.LLM_MODEL

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

CLASSIFICATION_PROMPT = """\
You are a document writing assistant. Analyse the text that was just typed \
in a document editor and decide whether to proactively suggest content.

INTERVENE (should_intervene: true) when ANY of these are true:
- Text contains placeholder markers: [TODO] [expand] [cite] [fill] [add] [detail] [research]
- A Markdown heading (# or ##) was written but has NO body text below it
- The last sentence is an unanswered research question
- A paragraph is present but is only 1 sentence and could use supporting evidence
- Text explicitly ends with "..." implying more is expected
- The user explicitly requests a report, analysis, summary, or document \
generation (e.g. "create me a report", "generate an analysis", "write a \
technical summary", "draft a document based on", "produce a report covering")

INTERVENE with action_type="full_report" when:
- The user asks for a complete report, analysis, or structured document
- The request references multiple topics or "the documents I have given"
- Examples: "create me a technical analysis report", "generate an executive \
summary of all documents", "write a comprehensive analysis"

DO NOT INTERVENE (should_intervene: false) when:
- The user is clearly mid-sentence (no terminal punctuation)
- The content looks complete and polished
- The text is a document title or pure formatting
- Fewer than 40 characters of meaningful text are present

Recent text (last ~500 chars before cursor):
\"\"\"
{recent_text}
\"\"\"

Reply ONLY with valid JSON — no markdown fences, no explanation:
{{
  "should_intervene": <true|false>,
  "reason": "<one sentence>",
  "action_type": "<insert|replace|new_section|full_report|none>",
  "search_query": "<keywords to search the knowledge base, or empty string>"
}}

action_type meanings:
  insert      — add new content right after the cursor
  replace     — rewrite the last paragraph (it exists but is weak/incomplete)
  new_section — add a ## heading + body after the cursor
  full_report — generate a complete multi-section report with tables and structure
  none        — do not intervene"""


GENERATION_PROMPT = """\
You are a precise document writing assistant.

Task: {action_type}
Reason: {reason}

Current document context (last ~1000 chars, for tone and style matching):
\"\"\"
{document_context}
\"\"\"

{rag_section}
Rules:
- Match the tone and writing style of the document exactly.
- Use Markdown: ## for section headings, **bold**, - for bullet lists.
- Do NOT write preambles like "Here is..." or "I will..." or "Certainly!".
- Output ONLY the content to insert into the document. Nothing else.
- Be concise. One focused paragraph or section. No padding.

Generate the content now:"""


REPORT_GENERATION_PROMPT = """\
You are a professional technical report writer.

Task: Generate a complete, well-structured report based on the user's request.

User request: {recent_text}

Current document context (for tone and style matching):
\"\"\"
{document_context}
\"\"\"

{rag_section}
Instructions:
- Use the topic-organized RAG context above. Each section labeled "Topic: X" \
contains retrieved chunks relevant to that subtopic. Use them to write the \
corresponding report section.
- Use Markdown formatting: # for title, ## for main sections, ### for \
subsections
- Include at least one markdown TABLE with structured data (metrics, \
comparisons, key findings, etc.)
- Use **bold** for key findings, - bullet lists for enumerations
- Structure the report with these sections:
  # Report Title
  ## Executive Summary
  ## Methodology
  ## Findings (with ### subsections for each major topic from the RAG context)
  ## Analysis and Implications
  ## Conclusion and Recommendations
- Match the tone and writing style of the existing document context
- Be thorough: aim for 800-1500 words
- Do NOT write preambles like "Here is the report..." or "I will now..."
- Output ONLY the report content in Markdown. Nothing else.
- Tables must use proper markdown syntax:
  | Column A | Column B | Column C |
  |----------|----------|----------|
  | value    | value    | value    |

Generate the report now:"""


# ---------------------------------------------------------------------------
# Phase 1: Classification
# ---------------------------------------------------------------------------

def classify_intervention(recent_text: str, model_name: str = DEFAULT_MODEL) -> dict:
    """
    Cheap binary call. Returns dict with keys:
      should_intervene (bool), reason (str), action_type (str), search_query (str),
      error (str|None) -- non-null if the classification itself failed
    """
    log.info("[classify] Starting classification with model=%s", model_name)
    log.info("[classify] Text to classify (%d chars): %.200s...", len(recent_text), recent_text)

    llm = ChatOllama(model=model_name, format="json", temperature=0, timeout=300)
    prompt = CLASSIFICATION_PROMPT.format(recent_text=recent_text[:600])

    t0 = time.time()
    try:
        response = llm.invoke(prompt)
        elapsed = time.time() - t0
        text = response.content.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        result = json.loads(text)
        if "should_intervene" not in result:
            log.warning("[classify] Response missing 'should_intervene' key: %s", text[:200])
            return _no_intervene("missing key in classification response")
        result.setdefault("reason", "")
        result.setdefault("action_type", "none")
        result.setdefault("search_query", "")
        result["error"] = None
        log.info("[classify] Done in %.1fs -- intervene=%s, action=%s, reason=%s, query=%s",
                 elapsed, result["should_intervene"], result["action_type"],
                 result["reason"], result["search_query"])
        return result
    except Exception as e:
        elapsed = time.time() - t0
        log.error("[classify] FAILED after %.1fs: %s", elapsed, e)
        return _no_intervene(f"classification failed: {e}", error=str(e))


def _no_intervene(reason: str, error: str = None) -> dict:
    return {
        "should_intervene": False,
        "reason": reason,
        "action_type": "none",
        "search_query": "",
        "error": error,
    }


# ---------------------------------------------------------------------------
# Phase 2: Generation (streams SSE events)
# ---------------------------------------------------------------------------

def _extract_subtopics(recent_text: str, model_name: str = DEFAULT_MODEL) -> list:
    """
    Cheap LLM call to decompose a report request into 3-5 key subtopics.
    Returns a list of search query strings, one per subtopic.
    Falls back to [recent_text] on failure.
    """
    llm = ChatOllama(model=model_name, format="json", temperature=0, timeout=300)
    prompt = (
        "Extract 3 to 5 key subtopics from this report request. "
        "Return a JSON array of short search queries (2-4 words each) "
        "that would find relevant content in a document knowledge base.\n\n"
        f"Request: {recent_text[:600]}\n\n"
        'Reply ONLY with valid JSON: ["topic1", "topic2", ...]'
    )
    try:
        response = llm.invoke(prompt)
        text = response.content.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        topics = json.loads(text)
        if isinstance(topics, list) and all(isinstance(t, str) for t in topics):
            return topics[:5]
    except Exception:
        pass
    return [recent_text[:100]]


def generate_proposal_stream(
    action_type: str,
    reason: str,
    search_query: str,
    document_context: str,
    recent_text: str,
    model_name: str = DEFAULT_MODEL,
) -> Generator[str, None, None]:
    """
    Runs RAG then generates content. Yields SSE-formatted strings.

    SSE event types emitted (in order):
      rag_status   -- {type, result_count}
      proposal     -- {type, proposal_id, action_type, reason, content, target_text}
      error        -- {type, error}
      [DONE]       -- terminal sentinel
    """
    proposal_id = str(uuid.uuid4())
    is_full_report = (action_type == "full_report")

    log.info("[generate] Starting generation: action=%s, model=%s, full_report=%s",
             action_type, model_name, is_full_report)

    rag_section = ""
    total_results = 0

    if is_full_report:
        log.info("[generate] Extracting subtopics for report...")
        topics = _extract_subtopics(recent_text, model_name=model_name)
        log.info("[generate] Subtopics: %s", topics)
        seen_uids = set()
        topic_sections = []

        for topic in topics:
            if not topic.strip():
                continue
            log.info("[generate] RAG retrieval for topic: '%s'", topic)
            t0 = time.time()
            try:
                results = rag_module.retrieve_all(topic.strip(), top_k=4)
            except Exception as e:
                log.error("[generate] RAG error for topic '%s': %s", topic, e)
                results = []

            unique = []
            for r in results:
                meta = r.get("metadata", {})
                uid = meta.get("source_uid", "") + ":" + r["text"][:60]
                if uid not in seen_uids:
                    seen_uids.add(uid)
                    unique.append(r)

            total_results += len(unique)
            elapsed = time.time() - t0
            log.info("[generate] Topic '%s': %d raw, %d unique chunks (%.1fs)",
                     topic, len(results), len(unique), elapsed)

            if unique:
                parts = []
                for r in unique:
                    meta = r.get("metadata", {})
                    src = meta.get("source_name", meta.get("source_uid", "Unknown"))
                    text = r["text"][:1200]
                    parts.append(f"  [From: {src}]\n  {text}")
                topic_sections.append(
                    f"Topic: {topic}\n" + "\n\n".join(parts)
                )

        if topic_sections:
            rag_section = (
                "Retrieved knowledge organized by topic:\n\n"
                + "\n\n\n".join(topic_sections)
                + "\n\n"
            )
    else:
        rag_results = []
        if search_query.strip():
            log.info("[generate] RAG retrieval for query: '%s'", search_query)
            t0 = time.time()
            try:
                rag_results = rag_module.retrieve_all(search_query, top_k=4)
            except Exception as e:
                log.error("[generate] RAG error: %s", e)
            elapsed = time.time() - t0
            log.info("[generate] RAG returned %d chunks (%.1fs)", len(rag_results), elapsed)
        else:
            log.info("[generate] No search query, skipping RAG")

        total_results = len(rag_results)

        if rag_results:
            parts = []
            for r in rag_results:
                meta = r.get("metadata", {})
                src = meta.get("source_name", meta.get("source_uid", "Unknown"))
                text = r["text"][:800]
                parts.append(f"[From: {src}]\n{text}")
            rag_section = (
                "Relevant knowledge retrieved from the document library:\n"
                + "\n\n---\n\n".join(parts)
                + "\n\n"
            )

    log.info("[generate] Total RAG results: %d", total_results)
    yield f"data: {json.dumps({'type': 'rag_status', 'result_count': total_results})}\n\n"

    target_text = ""
    if action_type == "replace":
        stripped = recent_text.strip()
        paragraphs = [p.strip() for p in stripped.split("\n\n") if p.strip()]
        if paragraphs:
            target_text = paragraphs[-1]

    if is_full_report:
        prompt = REPORT_GENERATION_PROMPT.format(
            recent_text=recent_text,
            document_context=document_context[-2000:],
            rag_section=rag_section,
        )
    else:
        prompt = GENERATION_PROMPT.format(
            action_type=action_type,
            reason=reason,
            document_context=document_context[-1500:],
            rag_section=rag_section,
        )

    log.info("[generate] Calling LLM for generation (model=%s, temp=0.3)...", model_name)
    llm = ChatOllama(model=model_name, temperature=0.3, timeout=300)

    full_content_parts = []
    t0 = time.time()
    try:
        for chunk in llm.stream(prompt):
            if chunk.content:
                full_content_parts.append(chunk.content)
                yield f"data: {json.dumps({'type': 'token', 'content': chunk.content})}\n\n"
    except Exception as e:
        elapsed = time.time() - t0
        log.error("[generate] LLM generation FAILED after %.1fs: %s", elapsed, e)
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"
        return

    elapsed = time.time() - t0
    generated = "".join(full_content_parts).strip()
    log.info("[generate] LLM generation done in %.1fs, output %d chars", elapsed, len(generated))
    log.info("[generate] Generated content preview: %.200s...", generated[:200])

    yield f"data: {json.dumps({'type': 'proposal', 'proposal_id': proposal_id, 'action_type': action_type, 'reason': reason, 'content': generated, 'target_text': target_text})}\n\n"
    yield "data: [DONE]\n\n"
