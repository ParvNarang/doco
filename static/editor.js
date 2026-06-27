// editor.js — Collaborative AI Editor logic

// ─── State ────────────────────────────────────────────────────────────────
let quill           = null;
let currentDocId    = null;
let currentProposal = null;
let agentTimer      = null;
let autosaveTimer   = null;
let isAgentThinking = false;
let healthTimer     = null;
let knowledgeTimer  = null;
const MODEL         = "qwen3.5:0.8b";
const HEALTH_INTERVAL = 15000;
const KNOWLEDGE_INTERVAL = 30000;

// ─── Boot ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const docId  = params.get("id");

  if (docId) {
    openEditor(docId);
  } else {
    showListView();
  }

  document.addEventListener("keydown", handleKeyDown);

  checkAgentHealth();
  checkKnowledgeStatus();
  healthTimer = setInterval(checkAgentHealth, HEALTH_INTERVAL);
  knowledgeTimer = setInterval(checkKnowledgeStatus, KNOWLEDGE_INTERVAL);
});

// ─── View switching ───────────────────────────────────────────────────────
function showListView() {
  document.getElementById("list-view").style.display  = "block";
  document.getElementById("editor-view").style.display = "none";
  document.title = "Doco \u2014 Editor";
  loadDocumentList();
}

function showEditorView() {
  document.getElementById("list-view").style.display  = "none";
  document.getElementById("editor-view").style.display = "flex";
}

// ─── Document list ────────────────────────────────────────────────────────
async function loadDocumentList() {
  const container = document.getElementById("doc-list-container");
  try {
    const res  = await fetch("/api/editor/documents");
    const docs = await res.json();

    if (!docs.length) {
      container.innerHTML = '<p class="empty-msg">No documents yet.<br>Click "+ New Document" to start.</p>';
      return;
    }

    container.innerHTML = docs.map(d => `
      <div class="doc-card" data-id="${d.id}">
        <div class="doc-card-title">${escHtml(d.title)}</div>
        <div class="doc-card-meta">Updated ${fmtDate(d.updated_at)}</div>
      </div>
    `).join("");

    container.querySelectorAll(".doc-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        window.history.pushState({}, "", `/editor?id=${id}`);
        openEditor(id);
      });
    });
  } catch (e) {
    container.innerHTML = '<p class="empty-msg">Failed to load documents.</p>';
  }
}

// New doc button
document.getElementById("new-doc-btn").addEventListener("click", async () => {
  const res = await fetch("/api/editor/documents", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ title: "Untitled Document" }),
  });
  const doc = await res.json();
  window.history.pushState({}, "", `/editor?id=${doc.id}`);
  openEditor(doc.id);
});

// Back to list
document.getElementById("back-to-list-btn").addEventListener("click", () => {
  window.history.pushState({}, "", "/editor");
  clearTimeout(autosaveTimer);
  if (currentDocId) doAutosave();
  showListView();
});

// ─── Open editor for a document ───────────────────────────────────────────
async function openEditor(docId) {
  currentDocId = docId;
  showEditorView();
  initQuill();

  try {
    const res = await fetch(`/api/editor/documents/${docId}`);
    if (!res.ok) throw new Error("not found");
    const doc = await res.json();

    document.getElementById("doc-title-input").value = doc.title || "";
    document.title = (doc.title || "Untitled") + " \u2014 Doco Editor";
    if (doc.content && doc.content.length) {
      quill.setContents({ ops: doc.content }, "api");
    }
  } catch {
    document.getElementById("doc-title-input").value = "Untitled Document";
    quill.setContents({ ops: [{ insert: "\n" }] }, "api");
  }

  setSaveStatus("saved");
}

// ─── Quill setup ──────────────────────────────────────────────────────────
function initQuill() {
  if (quill) {
    quill.off("text-change");
    const container = document.getElementById("quill-editor");
    container.innerHTML = "";
    quill = null;
  }

  quill = new Quill("#quill-editor", {
    theme:   "snow",
    modules: { toolbar: "#toolbar" },
    placeholder: "Start writing your document\u2026",
  });

  quill.on("text-change", (delta, oldDelta, source) => {
    if (source !== "user") return;

    setSaveStatus("saving");

    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(doAutosave, 3000);

    clearTimeout(agentTimer);
    agentTimer = setTimeout(evaluateWithAgent, 2000);
  });
}

// ─── Autosave ─────────────────────────────────────────────────────────────
async function doAutosave() {
  if (!currentDocId || !quill) return;
  const title   = document.getElementById("doc-title-input").value || "Untitled Document";
  const content = quill.getContents().ops;

  try {
    const res = await fetch(`/api/editor/documents/${currentDocId}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ title, content }),
    });
    if (res.ok) setSaveStatus("saved");
    else        setSaveStatus("error");
  } catch {
    setSaveStatus("error");
  }
}

// Title input
document.getElementById("doc-title-input").addEventListener("input", () => {
  setSaveStatus("saving");
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(doAutosave, 2000);
});

// ─── Export DOCX ──────────────────────────────────────────────────────────
document.getElementById("export-docx-btn").addEventListener("click", async () => {
  clearTimeout(autosaveTimer);
  await doAutosave();

  const btn = document.getElementById("export-docx-btn");
  btn.textContent = "Exporting\u2026";
  btn.disabled    = true;

  try {
    const res = await fetch(`/api/editor/documents/${currentDocId}/export/docx`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("export failed");

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const title = document.getElementById("doc-title-input").value || "document";
    a.href     = url;
    a.download = `${title}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Export failed: " + e.message);
  } finally {
    btn.textContent = "Export DOCX";
    btn.disabled    = false;
  }
});

// ─── Trigger Helper ───────────────────────────────────────────────────────
function shouldTriggerAgent(recentText) {
  const text = recentText.trim();
  if (text.replace(/\s+/g, "").length < 5) return false;

  // Explicit placeholder markers
  if (/\[TODO\]|\[expand\]|\[cite\]|\[fill\]|\[add\]|\[detail\]|\[research\]/i.test(text)) {
    return true;
  }

  // Explicit request patterns (report, generate, etc.)
  const explicitKeywords = [
    "write a report", "generate a report", "create a report",
    "write an analysis", "generate an analysis", "create an analysis",
    "write a summary", "generate a summary", "create a summary",
    "draft a document", "produce a report", "summarize", "explain",
    "help me with"
  ];
  if (explicitKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
    return true;
  }

  // Ends with ellipsis or question mark (question/continuation)
  if (text.endsWith("...") || text.endsWith("?")) {
    return true;
  }

  // Markdown heading with no body (e.g. "## Analysis\n" or "## Analysis\n\n")
  if (/^#{1,3}\s+[^\n]+\n\s*$/m.test(recentText)) {
    return true;
  }

  // General length check for proactive assistance
  return text.replace(/\s+/g, "").length >= 40;
}

// ─── Agent Cursor inside Quill ─────────────────────────────────────────────
function showAgentCursor(index) {
  hideAgentCursor();
  if (!quill) return;

  const bounds = quill.getBounds(index);
  if (!bounds) return;

  const cursor = document.createElement("div");
  cursor.id = "agent-editor-cursor";
  cursor.className = "agent-editor-cursor";

  // Position relative to the editor container
  const editorContainer = document.querySelector(".ql-container");
  if (editorContainer) {
    cursor.style.left = `${bounds.left}px`;
    cursor.style.top = `${bounds.top}px`;
    cursor.style.height = `${bounds.height}px`;
    editorContainer.appendChild(cursor);
  }
}

function hideAgentCursor() {
  const cursor = document.getElementById("agent-editor-cursor");
  if (cursor) cursor.remove();
}

// ─── Agent evaluation ─────────────────────────────────────────────────────
async function evaluateWithAgent() {
  if (isAgentThinking || !quill) return;

  const selection   = quill.getSelection();
  const cursor      = selection ? selection.index : quill.getLength() - 1;
  const recentStart = Math.max(0, cursor - 500);
  const ctxStart    = Math.max(0, cursor - 1200);

  const recentText      = quill.getText(recentStart, cursor - recentStart).trim();
  const documentContext = quill.getText(ctxStart,    cursor - ctxStart).trim();

  if (!shouldTriggerAgent(recentText)) return;

  if (currentProposal) return;

  isAgentThinking = true;
  hideAgentError();
  showAgentStatus("Agent analysing\u2026");
  showAgentCursor(cursor);

  const body = {
    recent_text:      recentText,
    document_context: documentContext,
    cursor_index:     cursor,
    doc_id:           currentDocId,
    model:            MODEL,
  };

  try {
    const res = await fetch("/api/agent/evaluate", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop();

      for (const block of blocks) {
        if (!block.startsWith("data: ")) continue;
        const raw = block.slice(6).trim();
        if (raw === "[DONE]") {
          hideAgentStatus();
          hideAgentCursor();
          isAgentThinking = false;
          return;
        }

        let evt;
        try { evt = JSON.parse(raw); } catch { continue; }

        if (evt.type === "error") {
          console.error("[agent]", evt.error);
          hideAgentStatus();
          hideAgentCursor();
          isAgentThinking = false;
          showAgentError(evt.error);
          return;
        }

        if (evt.type === "classification") {
          if (!evt.should_intervene) {
            hideAgentStatus();
            hideAgentCursor();
            isAgentThinking = false;
            return;
          }
          showAgentStatus("Agent generating suggestion\u2026");
          // Initialize streaming proposal
          currentProposal = {
            proposal_id: "",
            action_type: evt.action_type,
            reason: evt.reason,
            content: "",
            target_text: "",
            cursor_index: cursor
          };
          renderProposal(currentProposal);
        }

        if (evt.type === "rag_status") {
          showAgentStatus(`Extracting information (${evt.result_count} chunks found)\u2026`);
        }

        if (evt.type === "token") {
          showAgentStatus("Drafting suggestion\u2026");
          if (currentProposal) {
            currentProposal.content += evt.content;
            updateProposalStreamingContent(currentProposal);
          }
        }

        if (evt.type === "proposal") {
          hideAgentStatus();
          hideAgentCursor();
          isAgentThinking = false;
          currentProposal = { ...evt, cursor_index: cursor };
          renderProposal(currentProposal);
          return;
        }
      }
    }
  } catch (err) {
    console.error("[agent] fetch error:", err);
    hideAgentStatus();
    hideAgentCursor();
    isAgentThinking = false;
    showAgentError("Failed to reach agent. Is the server running?");
  } finally {
    hideAgentStatus();
    hideAgentCursor();
    isAgentThinking = false;
  }
}

// ─── Proposal UI ──────────────────────────────────────────────────────────
function renderProposal(p) {
  const panel = document.getElementById("proposal-panel");

  if (p.action_type === "full_report") {
    panel.style.maxWidth = "560px";
  } else {
    panel.style.maxWidth = "";
  }

  document.getElementById("agent-reason").textContent = p.reason || "";

  const proposedEl = document.getElementById("proposed-text");
  if (p.action_type === "full_report") {
    proposedEl.innerHTML = markdownToHtml(p.content || "");
  } else {
    proposedEl.textContent = p.content || "";
  }

  const origBlock = document.getElementById("original-block");
  if (p.action_type === "replace" && p.target_text) {
    document.getElementById("original-text").textContent = p.target_text;
    origBlock.style.display = "block";
    document.getElementById("proposed-label").textContent = "Replacement";
  } else {
    origBlock.style.display = "none";
    document.getElementById("proposed-label").textContent =
      p.action_type === "full_report" ? "Report Preview" : "Proposed";
  }

  panel.classList.add("panel-visible");
}

function updateProposalStreamingContent(p) {
  const panel = document.getElementById("proposal-panel");
  panel.classList.add("panel-visible");

  if (p.action_type === "full_report") {
    panel.style.maxWidth = "560px";
  } else {
    panel.style.maxWidth = "";
  }

  document.getElementById("agent-reason").textContent = p.reason || "";

  const proposedEl = document.getElementById("proposed-text");
  if (p.action_type === "full_report") {
    proposedEl.innerHTML = markdownToHtml(p.content || "");
  } else {
    proposedEl.textContent = p.content || "";
  }

  const origBlock = document.getElementById("original-block");
  origBlock.style.display = "none";
  document.getElementById("proposed-label").textContent =
    p.action_type === "full_report" ? "Report Preview" : "Proposed";

  // Auto scroll proposal content to bottom
  proposedEl.scrollTop = proposedEl.scrollHeight;
}

function acceptProposal() {
  if (!currentProposal) return;

  const { action_type, content, cursor_index, target_text, proposal_id } = currentProposal;
  const insertText = "\n\n" + content.trim() + "\n";

  if (action_type === "replace" && target_text) {
    const fullText = quill.getText();
    const idx = fullText.lastIndexOf(target_text);
    if (idx !== -1) {
      quill.deleteText(idx, target_text.length, "api");
      quill.insertText(idx, content.trim(), "api");
    } else {
      quill.insertText(cursor_index, insertText, "api");
    }
  } else {
    quill.insertText(cursor_index, insertText, "api");
  }

  quill.setSelection(cursor_index + insertText.length, 0, "api");

  fetch("/api/agent/accept", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ proposal_id }),
  });

  dismissProposal();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(doAutosave, 500);
}

function rejectProposal() {
  if (!currentProposal) return;
  fetch("/api/agent/reject", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ proposal_id: currentProposal.proposal_id }),
  });
  dismissProposal();
}

function dismissProposal() {
  document.getElementById("proposal-panel").classList.remove("panel-visible");
  document.getElementById("proposal-panel").style.maxWidth = "";
  hideAgentCursor();
  currentProposal = null;
}

// Button listeners
document.getElementById("accept-btn").addEventListener("click",  acceptProposal);
document.getElementById("reject-btn").addEventListener("click",  rejectProposal);
document.getElementById("dismiss-btn").addEventListener("click", dismissProposal);

// ─── Keyboard shortcuts ───────────────────────────────────────────────────
function handleKeyDown(e) {
  if (!currentProposal) return;
  if (e.key === "Tab") {
    e.preventDefault();
    acceptProposal();
  }
  if (e.key === "Escape") {
    dismissProposal();
  }
}

// ─── Agent status helpers (temporary, during processing) ──────────────────
function showAgentStatus(msg) {
  const el = document.getElementById("agent-status");
  document.getElementById("agent-status-text-temp").textContent = msg;
  el.classList.remove("hidden");
  const cursor = document.getElementById("agent-cursor-indicator");
  if (cursor) cursor.style.display = "flex";
}
function hideAgentStatus() {
  document.getElementById("agent-status").classList.add("hidden");
  const cursor = document.getElementById("agent-cursor-indicator");
  if (cursor) cursor.style.display = "none";
}

// ─── Agent health check ──────────────────────────────────────────────────
async function checkAgentHealth() {
  const dot  = document.getElementById("agent-dot");
  const text = document.getElementById("agent-online-status").querySelector("span:last-child");

  try {
    const res = await fetch("/api/agent/health");
    const data = await res.json();

    dot.className = "status-dot";
    if (data.status === "ok") {
      dot.classList.add("online");
      text.textContent = "Agent online";
    } else if (data.status === "no_model") {
      dot.classList.add("no-model");
      text.textContent = "Model missing";
      showAgentError(`Model "${data.model}" not found. Run: ollama pull ${data.model}`);
    } else {
      dot.classList.add("offline");
      text.textContent = "Agent offline";
      if (data.error) showAgentError(data.error);
    }
  } catch {
    dot.className = "status-dot offline";
    text.textContent = "Agent offline";
  }
}

// ─── Knowledge base status check ─────────────────────────────────────────
async function checkKnowledgeStatus() {
  const el   = document.getElementById("knowledge-status");
  const text = document.getElementById("knowledge-text");

  try {
    const res  = await fetch("/api/agent/knowledge-status");
    const data = await res.json();
    const count = data.total_documents || 0;

    if (count > 0) {
      text.textContent = `${count} doc${count !== 1 ? "s" : ""}`;
      el.classList.add("has-docs");
    } else {
      text.textContent = "No docs";
      el.classList.remove("has-docs");
    }
  } catch {
    text.textContent = "No docs";
    el.classList.remove("has-docs");
  }
}

// ─── Agent error toast ───────────────────────────────────────────────────
let errorToastTimer = null;
function showAgentError(msg) {
  const toast = document.getElementById("agent-error-toast");
  document.getElementById("agent-error-text").textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(errorToastTimer);
  errorToastTimer = setTimeout(() => toast.classList.add("hidden"), 8000);
}
function hideAgentError() {
  document.getElementById("agent-error-toast").classList.add("hidden");
  clearTimeout(errorToastTimer);
}

// ─── Save status helper ───────────────────────────────────────────────────
function setSaveStatus(state) {
  const el = document.getElementById("save-status");
  el.className = "save-status";
  if (state === "saving") {
    el.textContent = "Saving\u2026";
    el.classList.add("saving");
  } else if (state === "error") {
    el.textContent = "Save failed";
    el.classList.add("error");
  } else {
    el.textContent = "Saved";
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────
function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function markdownToHtml(md) {
  let html = escHtml(md);

  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_, header, sep, body) => {
    const headers = header.split("|").filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join("");
    const rows = body.trim().split("\n").map(row => {
      const cells = row.split("|").filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Paragraphs (double newline)
  html = html.replace(/\n\n+/g, "</p><p>");
  html = "<p>" + html + "</p>";
  html = html.replace(/<p>\s*<(h[1-3]|ul|ol|table)/g, "<$1");
  html = html.replace(/<\/(h[1-3]|ul|ol|table)>\s*<\/p>/g, "</$1>");
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}
