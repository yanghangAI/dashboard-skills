/* Inline comment overlay — public-passthrough mode.
 * Read:  unauthenticated GET on api.github.com/repos/<REPO>/issues
 * Write: open github.com/<REPO>/issues/new in a new tab with the body prefilled
 *
 * Implements 8 of the 10 load-bearing patterns from build-html-dashboard
 * Phase 5. Skipped: pattern 2 (GitHub identity as comment author — auth
 * happens on github.com) and pattern 7 (optimistic local update — submit
 * is a redirect, so we re-fetch on visibility change instead).
 */

const REPO = "yanghangAI/dashboard-skills";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const NEW_ISSUE_URL = `https://github.com/${REPO}/issues/new`;
const CTX_LEN = 32; // chars before/after for TextQuoteSelector

let lastSelection = null;

/* ---------- text walker (pattern 4) ---------- */
function walkText(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.parentElement.closest("script, style, #fb-modal, #fb-bubble")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let text = "";
  let n;
  while ((n = w.nextNode())) {
    nodes.push({ node: n, start: text.length, end: text.length + n.nodeValue.length });
    text += n.nodeValue;
  }
  return { text, nodes };
}

function normWS(s) {
  return s.replace(/\s+/g, " ").trim();
}

/* Locate a quote within the original concatenated text. Returns positions
 * into the original text (so wrapRange can use walk.nodes positions).
 *
 * Strategy:
 *  1. Exact match — pre/suf disambiguation if multiple hits.
 *  2. Whitespace-flexible regex match (collapses runs of \s in the quote
 *     to \s+; matches against original text so positions stay valid).
 *  3. Case-insensitive whitespace-flexible regex.
 *  4. Uppercase-container heuristic: if multiple case-insensitive matches,
 *     prefer one whose ancestor (in the walk) has text-transform: uppercase.
 *
 * The original v1 had a bug where the normalized fallback returned indexes
 * into the normalized text and the caller used them as if they were
 * positions in the original — silently wrapping the wrong characters. The
 * regex approach preserves original positions.
 */
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function locateQuote(text, quote, pre, suf) {
  if (!quote) return -1;

  // 1. Exact match, with pre disambiguation if available
  let from = 0;
  let firstExact = -1;
  for (;;) {
    const idx = text.indexOf(quote, from);
    if (idx === -1) break;
    if (firstExact === -1) firstExact = idx;
    if (!pre || text.slice(Math.max(0, idx - pre.length), idx).endsWith(pre)) {
      return { start: idx, end: idx + quote.length };
    }
    from = idx + 1;
  }
  if (firstExact !== -1) return { start: firstExact, end: firstExact + quote.length };

  // 2. Whitespace-flexible regex match (positions in original text)
  const wsFlex = escapeRegex(quote).replace(/\s+/g, "\\s+");
  try {
    const m = text.match(new RegExp(wsFlex));
    if (m) return { start: m.index, end: m.index + m[0].length };
  } catch (_) {}

  // 3. Case-insensitive whitespace-flexible
  try {
    const m = text.match(new RegExp(wsFlex, "i"));
    if (m) return { start: m.index, end: m.index + m[0].length };
  } catch (_) {}

  return -1;
}

/* Wrap a [start, end) range in the concatenated text by walking the
 * recorded node positions and splitting text nodes as needed. */
function wrapRange(walk, start, end, cls, dataset) {
  const wraps = [];
  for (const { node, start: ns, end: ne } of walk.nodes) {
    if (ne <= start || ns >= end) continue;
    const localStart = Math.max(0, start - ns);
    const localEnd = Math.min(node.nodeValue.length, end - ns);
    let target = node;
    if (localEnd < node.nodeValue.length) target = target.splitText(localEnd) && node;
    if (localStart > 0) target = target.splitText(localStart);
    const span = document.createElement("span");
    span.className = cls;
    if (dataset) Object.entries(dataset).forEach(([k, v]) => span.dataset[k] = v);
    target.parentNode.insertBefore(span, target);
    span.appendChild(target);
    wraps.push(span);
  }
  return wraps;
}

/* ---------- DOM binding lookup ---------- */
function findBinding(node) {
  let el = node.nodeType === 3 ? node.parentElement : node;
  const out = {};
  while (el && el !== document.body) {
    if (!out.artifact && el.dataset.artifact) out.artifact = el.dataset.artifact;
    if (!out.recordId && el.dataset.recordId) out.recordId = el.dataset.recordId;
    if (!out.agentId && el.dataset.agentId) out.agentId = el.dataset.agentId;
    el = el.parentElement;
  }
  return out;
}

/* ---------- selection → bubble (pattern 1: static button via HTML) ---------- */
function onSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return hideBubble();
  const range = sel.getRangeAt(0);
  const text = sel.toString();
  if (text.trim().length < 3) return hideBubble();
  const rect = range.getBoundingClientRect();
  const bubble = document.getElementById("fb-bubble");
  bubble.style.top = `${window.scrollY + rect.bottom + 6}px`;
  bubble.style.left = `${window.scrollX + rect.left}px`;
  bubble.style.display = "block";
  const binding = findBinding(range.startContainer);
  const walk = walkText(document.body);
  const idx = walk.text.indexOf(text);
  let pre = "", suf = "";
  if (idx !== -1) {
    pre = walk.text.slice(Math.max(0, idx - CTX_LEN), idx);
    suf = walk.text.slice(idx + text.length, idx + text.length + CTX_LEN);
  }
  lastSelection = { quote: text, pre, suf, binding };
}

function hideBubble() {
  document.getElementById("fb-bubble").style.display = "none";
}

/* ---------- modal (pattern 10: severity tier control) ---------- */
function openModal() {
  if (!lastSelection) return;
  const modal = document.getElementById("fb-modal");
  modal.querySelector(".quote").textContent = lastSelection.quote;
  const tgt = modal.querySelector(".target");
  const b = lastSelection.binding;
  const parts = [];
  if (b.agentId) parts.push(`agent: ${b.agentId}`);
  if (b.artifact) parts.push(`artifact: ${b.artifact}`);
  if (b.recordId) parts.push(`record: ${b.recordId}`);
  tgt.textContent = parts.length ? parts.join(" · ") : `page: ${location.pathname}`;
  modal.querySelector("textarea").value = "";
  modal.querySelectorAll('input[name="sev"]').forEach(r => r.checked = (r.value === "fyi"));
  modal.querySelectorAll(".sev label").forEach(l => {
    l.classList.toggle("checked", l.querySelector("input").checked);
  });
  modal.classList.add("open");
  hideBubble();
}

function closeModal() {
  document.getElementById("fb-modal").classList.remove("open");
  lastSelection = null;
}

function submitModal() {
  if (!lastSelection) return closeModal();
  const sev = document.querySelector('input[name="sev"]:checked').value;
  const note = document.querySelector("#fb-modal textarea").value.trim();
  const b = lastSelection.binding;

  const labels = ["comment"];
  if (sev === "fix" || sev === "block") labels.push("claude-fix");
  if (sev === "block") labels.push("block");
  if (sev === "override") labels.push("override");

  const sevLabel = { fyi: "FYI", fix: "Fix", block: "Block", override: "Override" }[sev];
  const title = `[${sevLabel}] ${truncate(lastSelection.quote, 60)}`;
  const body = [
    `**Severity:** ${sevLabel}`,
    `**Where:** ${location.href}`,
    b.agentId ? `**Agent:** ${b.agentId}` : null,
    b.artifact ? `**Artifact:** ${b.artifact}` : null,
    b.recordId ? `**Record:** ${b.recordId}` : null,
    ``,
    `**Quote:**`,
    `> ${lastSelection.quote.replace(/\n/g, "\n> ")}`,
    ``,
    `**Note:**`,
    note || "_(no additional note)_",
    ``,
    `<!-- fb-ctx: pre=${JSON.stringify(lastSelection.pre)} suf=${JSON.stringify(lastSelection.suf)} -->`,
  ].filter(Boolean).join("\n");

  const params = new URLSearchParams({
    title,
    body,
    labels: labels.join(","),
  });
  window.open(`${NEW_ISSUE_URL}?${params.toString()}`, "_blank", "noopener");
  closeModal();
}

function truncate(s, n) {
  s = s.replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ---------- render existing comments inline (patterns 3, 8, 9) ---------- */
function unwrapExistingAnchors() {
  document.querySelectorAll(".fb-anchor").forEach(a => {
    const parent = a.parentNode;
    while (a.firstChild) parent.insertBefore(a.firstChild, a);
    parent.removeChild(a);
  });
  document.body.normalize(); // merge fragmented text nodes
}

let _loadingComments = false;
async function loadComments() {
  if (_loadingComments) return;
  _loadingComments = true;
  // Pattern 8: cache-bust. Pattern 9: state=open.
  const url = `${API_BASE}/issues?state=open&labels=comment&per_page=100&_t=${Date.now()}`;
  let issues;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    issues = await r.json();
  } catch (e) {
    _loadingComments = false;
    return; // network / auth / rate-limit failure — silent for dogfood
  }
  const countEl = document.getElementById("fb-count");
  if (countEl) {
    countEl.textContent = issues.length || "";
    countEl.title = issues.length ? `${issues.length} open dashboard comment${issues.length > 1 ? "s" : ""} (anchored: highlighted text; unanchored: bottom-right pill)` : "";
  }

  unwrapExistingAnchors();
  const walk = walkText(document.body);
  const pageUrl = location.href.replace(/#.*$/, "");
  const unanchored = [];

  // Cache full issue objects for the popover click handler
  _commentsByNumber.clear();
  for (const issue of issues) _commentsByNumber.set(issue.number, issue);

  for (const issue of issues) {
    const meta = parseIssueBody(issue.body || "");
    if (!meta.where || meta.where.replace(/#.*$/, "") !== pageUrl) continue;
    if (!meta.quote) { unanchored.push(issue); continue; }
    const loc = locateQuote(walk.text, meta.quote, meta.pre, meta.suf);
    if (loc === -1) { unanchored.push(issue); continue; }
    const sev = (meta.severity || "fyi").toLowerCase();
    wrapRange(walk, loc.start, loc.end, "fb-anchor", {
      sev,
      issue: String(issue.number),
    });
    // No marker pill — patterns 13/14 deliberately understated.
    // The text underline alone signals "comment here"; click reveals the popover.
  }

  renderUnanchoredToggle(unanchored);
  _loadingComments = false;
}

function renderUnanchoredToggle(unanchored) {
  document.querySelectorAll(".fb-unanchored-toggle, .fb-unanchored-list").forEach(n => n.remove());
  if (!unanchored.length) return;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "fb-unanchored-toggle";
  toggle.title = "Comments on this page that couldn't be anchored to specific text — click to expand";
  toggle.textContent = `${unanchored.length} floating`;
  document.body.appendChild(toggle);
  let expanded = false;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    expanded = !expanded;
    document.querySelectorAll(".fb-unanchored-list").forEach(n => n.remove());
    if (!expanded) return;
    const list = document.createElement("div");
    list.className = "fb-unanchored-list";
    list.innerHTML = `
      <strong>${unanchored.length} unanchored comment${unanchored.length > 1 ? "s" : ""}</strong>
      <ul>
        ${unanchored.map(i => {
          const meta = parseIssueBody(i.body || "");
          const sev = (meta.severity || "fyi").toLowerCase();
          return `
            <li>
              <button type="button" class="fb-uitem" data-issue="${i.number}">
                <span class="badge sev-${escapeAttr(sev)}">${escapeHTML(meta.severity || "FYI")}</span>
                <span class="num">#${i.number}</span>
                <span class="title">${escapeHTML(i.title.replace(/^\[[^\]]+\]\s*/, ""))}</span>
              </button>
            </li>`;
        }).join("")}
      </ul>`;
    document.body.appendChild(list);
    list.querySelectorAll(".fb-uitem").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showPopover(btn);
      });
    });
  });
  document.addEventListener("click", (e) => {
    if (expanded && !e.target.closest(".fb-unanchored-toggle, .fb-unanchored-list, #fb-popover")) {
      expanded = false;
      document.querySelectorAll(".fb-unanchored-list").forEach(n => n.remove());
    }
  });
}

document.addEventListener("click", (e) => {
  const a = e.target.closest(".fb-anchor");
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  showPopover(a);
}, true);

function parseIssueBody(body) {
  const out = {};
  const m = (re) => (body.match(re) || [])[1]?.trim();
  out.severity = m(/\*\*Severity:\*\*\s*([^\n]+)/);
  out.where = m(/\*\*Where:\*\*\s*([^\n]+)/);
  out.agent = m(/\*\*Agent:\*\*\s*([^\n]+)/);
  out.artifact = m(/\*\*Artifact:\*\*\s*([^\n]+)/);
  out.record = m(/\*\*Record:\*\*\s*([^\n]+)/);
  const q = body.match(/\*\*Quote:\*\*\s*\n>\s*([^\n]+(?:\n>\s*[^\n]+)*)/);
  if (q) out.quote = q[1].replace(/\n>\s*/g, "\n").trim();
  const note = body.match(/\*\*Note:\*\*\s*\n([\s\S]+?)(?:\n\n|\n<!--|$)/);
  if (note) out.note = note[1].trim();
  const ctx = body.match(/<!--\s*fb-ctx:\s*pre=(.+?)\s+suf=(.+?)\s*-->/);
  if (ctx) {
    try { out.pre = JSON.parse(ctx[1]); } catch (_) {}
    try { out.suf = JSON.parse(ctx[2]); } catch (_) {}
  }
  return out;
}

/* ---------- click-to-reveal popover (pattern 14) ---------- */
const _commentsByNumber = new Map();

function relTimeShort(ts) {
  const diff = Date.now() - Date.parse(ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / (60 * 24))} d ago`;
}

function closePopover() {
  const p = document.getElementById("fb-popover");
  if (p) p.remove();
  document.removeEventListener("click", _outsideClose, true);
  document.removeEventListener("keydown", _escClose);
}

function _outsideClose(e) {
  if (e.target.closest("#fb-popover")) return;
  if (e.target.closest(".fb-anchor")) return; // a different anchor click will swap, not close
  closePopover();
}

function _escClose(e) {
  if (e.key === "Escape") closePopover();
}

function showPopover(anchor) {
  const num = parseInt(anchor.dataset.issue, 10);
  const issue = _commentsByNumber.get(num);
  if (!issue) return;
  const meta = parseIssueBody(issue.body || "");
  const sev = (meta.severity || "fyi").toLowerCase();

  closePopover();

  const popover = document.createElement("div");
  popover.id = "fb-popover";
  popover.className = "fb-popover";
  popover.dataset.sev = sev;
  popover.innerHTML = `
    <header>
      <span class="badge sev-${escapeAttr(sev)}">${escapeHTML(meta.severity || "FYI")}</span>
      <span class="num">#${issue.number}</span>
      <button type="button" class="close" aria-label="Close">×</button>
    </header>
    <div class="note">${escapeHTML(meta.note || "(no note)")}</div>
    <footer>
      <span class="by">filed by <a href="${escapeAttr(issue.user.html_url)}" target="_blank" rel="noopener">@${escapeHTML(issue.user.login)}</a> · ${escapeHTML(relTimeShort(issue.created_at))}</span>
      <a class="open" href="${escapeAttr(issue.html_url)}" target="_blank" rel="noopener">open on GitHub →</a>
    </footer>`;
  document.body.appendChild(popover);

  // Position below the anchor; flip into view if off the edges
  const rect = anchor.getBoundingClientRect();
  const popW = popover.offsetWidth;
  const popH = popover.offsetHeight;
  let top = window.scrollY + rect.bottom + 6;
  let left = window.scrollX + rect.left;
  // Right edge
  if (left + popW > window.scrollX + window.innerWidth - 8) {
    left = window.scrollX + window.innerWidth - popW - 8;
  }
  // Below the viewport → flip above
  if (rect.bottom + popH + 6 > window.innerHeight - 8 && rect.top > popH + 6) {
    top = window.scrollY + rect.top - popH - 6;
  }
  popover.style.top = `${top}px`;
  popover.style.left = `${Math.max(8, left)}px`;

  popover.querySelector(".close").addEventListener("click", closePopover);
  // Defer outside-click so the click that opened the popover doesn't immediately close it
  setTimeout(() => {
    document.addEventListener("click", _outsideClose, true);
    document.addEventListener("keydown", _escClose);
  }, 0);
}

function escapeAttr(s) { return String(s || "").replace(/"/g, "&quot;"); }

/* ---------- freshness rendering ---------- */
function renderFreshness() {
  const now = Date.now();
  document.querySelectorAll("[data-fresh-at]").forEach(el => {
    const t = Date.parse(el.dataset.freshAt);
    if (isNaN(t)) return;
    const ageMin = Math.floor((now - t) / 60000);
    let cls = "fresh", label;
    if (ageMin < 0) { label = "just now"; }
    else if (ageMin < 1) { label = "<1 min ago"; }
    else if (ageMin < 60) { label = `${ageMin} min ago`; }
    else if (ageMin < 60 * 24) { label = `${Math.floor(ageMin / 60)} h ago`; }
    else { label = `${Math.floor(ageMin / (60 * 24))} d ago`; }
    if (ageMin > 30) cls += " fresh-stale";
    if (ageMin > 360) cls += " fresh-old";
    const tag = document.createElement("span");
    tag.className = cls;
    tag.title = el.dataset.freshAt + (el.dataset.source ? ` · ${el.dataset.source}` : "");
    tag.textContent = `· ${label}`;
    el.appendChild(tag);
  });
}

/* ---------- boot ---------- */
function initOverlay() {
  // Inject bubble and modal once
  if (document.getElementById("fb-bubble")) return;
  const bubble = document.createElement("button");
  bubble.id = "fb-bubble";
  bubble.type = "button";
  bubble.textContent = "Comment";
  bubble.addEventListener("mousedown", (e) => { e.preventDefault(); openModal(); });
  document.body.appendChild(bubble);

  const modal = document.createElement("div");
  modal.id = "fb-modal";
  modal.innerHTML = `
    <div class="panel">
      <h3>Anchor a comment to selected text</h3>
      <p class="muted">Submits to GitHub Issues as a new draft in a new tab. You'll need to be signed in to github.com.</p>
      <div class="target"></div>
      <blockquote class="quote"></blockquote>
      <label>Severity</label>
      <div class="sev">
        <label><input type="radio" name="sev" value="fyi" checked>FYI<span class="desc">note only; no action expected</span></label>
        <label><input type="radio" name="sev" value="fix">Fix<span class="desc">correct this; agent edits artifact</span></label>
        <label><input type="radio" name="sev" value="block">Block<span class="desc">stop work here until resolved</span></label>
        <label><input type="radio" name="sev" value="override">Override<span class="desc">accept the risk; durable record</span></label>
      </div>
      <label>Note (optional)</label>
      <textarea placeholder="What's wrong / what should change / why"></textarea>
      <div class="actions">
        <button type="button" class="cancel">Cancel</button>
        <button type="button" class="primary submit">Open new issue draft →</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector(".cancel").addEventListener("click", closeModal);
  modal.querySelector(".submit").addEventListener("click", submitModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  modal.querySelectorAll(".sev label").forEach(l => {
    l.addEventListener("click", () => {
      modal.querySelectorAll(".sev label").forEach(x => x.classList.remove("checked"));
      l.classList.add("checked");
    });
  });

  document.addEventListener("selectionchange", onSelection);
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest("#fb-bubble, #fb-modal")) return;
    setTimeout(hideBubble, 100);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  renderFreshness();
  loadComments();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadComments(); });
  // Each page dispatches `dashboard:rendered` after its async IIFE sets
  // page.innerHTML. Re-run freshness + comments against the now-populated DOM.
  document.addEventListener("dashboard:rendered", () => {
    renderFreshness();
    loadComments();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initOverlay);
} else {
  initOverlay();
}
