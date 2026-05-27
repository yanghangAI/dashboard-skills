/* Shared helpers for dashboard pages. Not a framework — small utility set. */

async function fetchJSON(path) {
  const r = await fetch(`${path}?_t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function fetchJSONL(path) {
  const r = await fetch(`${path}?_t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const text = await r.text();
  return text.split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
}

function escapeHTML(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function relTime(ts) {
  const t = Date.parse(ts);
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 0) return "future";
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / (60 * 24))} d ago`;
}

function mountNav(active) {
  const links = [
    ["index.html",     "status"],
    ["timeline.html",  "timeline"],
    ["decisions.html", "decisions"],
    ["drift.html",     "drift"],
    ["trust.html",     "trust"],
  ];
  const mount = document.getElementById("nav-mount");
  mount.outerHTML = `
    <nav class="top">
      <div class="brand">dashboard-skills · oversight</div>
      ${links.map(([href, label]) =>
        `<a href="${href}"${href === active ? ' class="active"' : ''}>${label}</a>`
      ).join("")}
      <span id="fb-count" aria-label="open comments"></span>
    </nav>`;
}

function renderError(container, err) {
  container.innerHTML = `<div class="section"><strong style="color: var(--bad)">Render error:</strong> ${escapeHTML(err.message)}</div>`;
}

/* Wrap a fact in provenance attributes for freshness UI + DOM bindings. */
function provFresh(text, source, verifiedAt, opts = {}) {
  const attrs = [
    `data-source="${escapeHTML(source)}"`,
    `data-fresh-at="${escapeHTML(verifiedAt)}"`,
  ];
  if (opts.artifact) attrs.push(`data-artifact="${escapeHTML(opts.artifact)}"`);
  if (opts.recordId) attrs.push(`data-record-id="${escapeHTML(opts.recordId)}"`);
  if (opts.agentId)  attrs.push(`data-agent-id="${escapeHTML(opts.agentId)}"`);
  return `<span ${attrs.join(" ")}>${escapeHTML(text)}</span>`;
}
