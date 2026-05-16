import type { AppConfig } from "./config.js";
import { escapeHtml } from "./html.js";
import { artifactSandbox } from "./security.js";
import { artifactUrls, shareUrl } from "./url.js";
import type { Artifact, ArtifactRecord, ArtifactShare, ArtifactVersion } from "./types.js";

interface ViewerOptions {
  share?: ArtifactShare;
  shareToken?: string;
  versions?: ArtifactVersion[];
}

export function renderHome(config: AppConfig, records: ArtifactRecord[], nonce: string): string {
  const cards = records.length
    ? records.map(({ artifact, currentVersion }) => renderArtifactCard(config, artifact, currentVersion)).join("")
    : `<div class="empty">No public artifacts yet.</div>`;

  return layout({
    title: "Agent Artifact Engine",
    nonce,
    body: `
      <header class="topbar">
        <a class="brand" href="/">Agent Artifact Engine</a>
        <nav>
          <a href="/health">Health</a>
          <a href="/v1/tags">Tags</a>
          <a href="/v1/categories">Categories</a>
        </nav>
      </header>
      <main class="shell">
        <section class="intro">
          <p class="eyebrow">Self-hostable artifact publishing</p>
          <h1>Publish HTML and safe MDX from agents.</h1>
          <p>Immutable versions, sandboxed viewers, share links, and static export without hosted SaaS baggage.</p>
          <code>POST /v1/artifacts</code>
        </section>
        <section class="panel">
          <div class="section-head">
            <h2>Public artifacts</h2>
            <span>${records.length} visible</span>
          </div>
          <div class="artifact-grid">${cards}</div>
        </section>
      </main>
      ${copyScript(nonce)}
    `
  });
}

export function renderArtifactViewer(
  config: AppConfig,
  artifact: Artifact,
  version: ArtifactVersion,
  nonce: string,
  options: ViewerOptions = {}
): string {
  const urls = artifactUrls(config, artifact, version);
  const rawUrl = options.shareToken ? `${urls.rawUrl}?share=${encodeURIComponent(options.shareToken)}` : urls.rawUrl;
  const viewerUrl = options.share ? shareUrl(config, options.share) : urls.viewUrl;
  const versions = options.versions ?? [version];
  const versionLabels = versionLabelMap(versions);

  return layout({
    title: `${artifact.title} - Agent Artifact Engine`,
    nonce,
    body: `
      <header class="topbar">
        <a class="brand" href="/">Agent Artifact Engine</a>
        <nav>
          <button class="linklike" data-copy="${escapeHtml(viewerUrl)}">Copy link</button>
          <a href="${escapeHtml(rawUrl)}" target="_blank" rel="noreferrer">Raw</a>
          <a href="${escapeHtml(rawUrl)}?download=1">Download</a>
        </nav>
      </header>
      <main class="viewer-shell">
        <section class="artifact-heading">
          <div>
            <p class="eyebrow">Sandboxed artifact</p>
            <h1>${escapeHtml(artifact.title)}</h1>
            ${artifact.description ? `<p>${escapeHtml(artifact.description)}</p>` : ""}
          </div>
          <dl>
            <div><dt>Visibility</dt><dd>${escapeHtml(artifact.visibility)}</dd></div>
            <div><dt>Version</dt><dd>${escapeHtml(versionLabels.get(version.id) ?? "v1")}</dd></div>
            <div><dt>Format</dt><dd>${escapeHtml(version.sourceFormat.toUpperCase())}</dd></div>
          </dl>
        </section>
        <section class="viewer-layout">
          <div class="frame-wrap">
            <div class="frame-toolbar">
              <span>Raw artifact</span>
              <code>${escapeHtml(rawUrl)}</code>
            </div>
            <iframe
              class="artifact-frame"
              src="${escapeHtml(rawUrl)}"
              sandbox="${escapeHtml(artifactSandbox(config))}"
              referrerpolicy="no-referrer"
              title="${escapeHtml(artifact.title)} artifact"
            ></iframe>
          </div>
          <aside class="details">
            <section>
              <h2>Details</h2>
              <dl class="details-list">
                <div><dt>Rendered size</dt><dd>${escapeHtml(formatBytes(version.bytes))}</dd></div>
                <div><dt>Source size</dt><dd>${escapeHtml(formatBytes(version.sourceBytes))}</dd></div>
                ${(artifact.categories ?? []).length ? `<div><dt>Category</dt><dd>${renderTaxonomyPills(artifact, "categories")}</dd></div>` : ""}
                ${(artifact.tags ?? []).length ? `<div><dt>Tags</dt><dd>${renderTaxonomyPills(artifact, "tags")}</dd></div>` : ""}
                <div><dt>Checksum</dt><dd><code>${escapeHtml(shortChecksum(version.checksum))}</code></dd></div>
                <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(version.createdAt))}</dd></div>
              </dl>
            </section>
            <section>
              <h2>Versions</h2>
              <div class="version-list">
                ${versions.map((item) => renderVersionRow(config, item, version, options.shareToken, versionLabels.get(item.id) ?? item.id)).join("")}
              </div>
            </section>
          </aside>
        </section>
      </main>
      ${copyScript(nonce)}
    `
  });
}

export function renderEmbed(config: AppConfig, artifact: Artifact, version: ArtifactVersion): string {
  const urls = artifactUrls(config, artifact, version);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(artifact.title)}</title>
  <style>
    html, body { height: 100%; margin: 0; background: #fff; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <iframe src="${escapeHtml(urls.rawUrl)}" sandbox="${escapeHtml(artifactSandbox(config))}" referrerpolicy="no-referrer" title="${escapeHtml(artifact.title)}"></iframe>
</body>
</html>`;
}

export function renderNotFound(nonce: string): string {
  return layout({
    title: "Not Found - Agent Artifact Engine",
    nonce,
    body: `
      <main class="shell centered">
        <section class="intro">
          <p class="eyebrow">404</p>
          <h1>Artifact not found.</h1>
          <p>The artifact may be private, expired, or missing.</p>
          <a class="button" href="/">Back home</a>
        </section>
      </main>
    `
  });
}

function renderArtifactCard(config: AppConfig, artifact: Artifact, version: ArtifactVersion): string {
  const urls = artifactUrls(config, artifact, version);

  return `
    <article class="artifact-card">
      <a class="thumb" href="${escapeHtml(urls.viewUrl)}" aria-label="Open ${escapeHtml(artifact.title)}">
        <span>${escapeHtml(version.sourceFormat.toUpperCase())}</span>
        <strong>${escapeHtml(artifact.title)}</strong>
      </a>
      <div class="artifact-card-body">
        <a class="artifact-title" href="${escapeHtml(urls.viewUrl)}">${escapeHtml(artifact.title)}</a>
        ${artifact.description ? `<p>${escapeHtml(artifact.description)}</p>` : `<p>${escapeHtml(version.sourceFormat.toUpperCase())} artifact</p>`}
        ${renderTaxonomyPills(artifact, "all")}
        <div class="artifact-meta">
          <span>${escapeHtml(artifact.visibility)}</span>
          <time datetime="${escapeHtml(artifact.updatedAt)}">${escapeHtml(formatDate(artifact.updatedAt))}</time>
        </div>
        <div class="actions">
          <a class="button" href="${escapeHtml(urls.viewUrl)}">Open</a>
          <button class="button secondary" data-copy="${escapeHtml(urls.viewUrl)}">Share</button>
        </div>
      </div>
    </article>
  `;
}

function renderVersionRow(
  config: AppConfig,
  item: ArtifactVersion,
  currentVersion: ArtifactVersion,
  shareToken?: string,
  label = item.id
): string {
  const rawUrl = `${config.artifactBaseUrl}/raw/${item.id}${shareToken ? `?share=${encodeURIComponent(shareToken)}` : ""}`;
  const current = item.id === currentVersion.id;

  return `
    <div class="version-row ${current ? "current" : ""}">
      <div>
        <strong>${escapeHtml(label)}${current ? " current" : ""}</strong>
        <span>${escapeHtml(item.sourceFormat.toUpperCase())} - ${escapeHtml(formatBytes(item.bytes))}</span>
      </div>
      <a href="${escapeHtml(rawUrl)}" target="_blank" rel="noreferrer">Raw</a>
    </div>
  `;
}

function renderTaxonomyPills(artifact: Artifact, kind: "tags" | "categories" | "all"): string {
  const tags = kind === "categories" ? [] : artifact.tags ?? [];
  const categories = kind === "tags" ? [] : artifact.categories ?? [];
  const pills = [
    ...categories.map((value) => `<span class="pill category">${escapeHtml(value)}</span>`),
    ...tags.map((value) => `<span class="pill">#${escapeHtml(value)}</span>`)
  ];

  return pills.length ? `<div class="pills">${pills.join("")}</div>` : "";
}

function versionLabelMap(versions: ArtifactVersion[]): Map<string, string> {
  const ordered = [...versions].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return new Map(ordered.map((version, index) => [version.id, `v${index + 1}`]));
}

function layout(options: { title: string; body: string; nonce: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
  <style>${baseCss()}</style>
</head>
<body>
${options.body}
</body>
</html>`;
}

function copyScript(nonce: string): string {
  return `<script nonce="${escapeHtml(nonce)}">
    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        const value = button.getAttribute("data-copy");
        if (!value) return;
        await navigator.clipboard.writeText(value);
        const previous = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => { button.textContent = previous; }, 1200);
      });
    });
  </script>`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function shortChecksum(value: string): string {
  return value.length > 16 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function baseCss(): string {
  return `
    :root {
      color-scheme: light;
      --text: #161616;
      --muted: #66615f;
      --paper: #fffdf8;
      --panel: #ffffff;
      --line: #171717;
      --soft-line: #ded8ce;
      --accent: #2358ff;
      --accent-soft: #dbe5ff;
      --shadow: 8px 8px 0 #171717;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        linear-gradient(rgba(23,23,23,.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(23,23,23,.055) 1px, transparent 1px),
        var(--paper);
      background-size: 42px 42px;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    a { color: inherit; }
    .topbar {
      min-height: 72px;
      border-bottom: 3px solid var(--line);
      background: rgba(255, 253, 248, .94);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 16px clamp(18px, 5vw, 56px);
    }
    .brand {
      font-weight: 950;
      font-size: 1.1rem;
      text-decoration: none;
    }
    nav {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
      font-weight: 800;
    }
    nav a, .linklike {
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
    }
    .shell, .viewer-shell {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 36px 0 80px;
    }
    .centered {
      display: grid;
      place-items: center;
      min-height: 70vh;
    }
    .intro {
      margin: 24px 0 34px;
      max-width: 860px;
    }
    .eyebrow {
      margin: 0 0 12px;
      text-transform: uppercase;
      font-weight: 900;
      letter-spacing: .08em;
      color: var(--muted);
    }
    h1 {
      margin: 0 0 18px;
      font-size: clamp(2.4rem, 7vw, 6rem);
      line-height: .92;
      letter-spacing: 0;
    }
    h2 {
      margin: 0;
      font-size: 1.45rem;
    }
    p {
      color: var(--muted);
      font-size: 1.04rem;
      line-height: 1.55;
    }
    code {
      border: 2px solid var(--line);
      border-radius: 7px;
      background: #f7f9ff;
      padding: .12rem .36rem;
      font-weight: 800;
    }
    .panel, .details section {
      border: 3px solid var(--line);
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 24px;
      border-bottom: 2px solid var(--line);
      color: var(--muted);
      font-weight: 900;
    }
    .artifact-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
      padding: 24px;
    }
    .artifact-card {
      border: 3px solid var(--line);
      background: var(--panel);
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    .thumb {
      aspect-ratio: 16 / 10;
      border-bottom: 2px solid var(--line);
      background: var(--accent-soft);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 22px;
      text-decoration: none;
    }
    .thumb span, .artifact-meta, .version-row span {
      color: var(--muted);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    .thumb strong {
      font-size: 1.45rem;
      line-height: 1.05;
    }
    .artifact-card-body {
      padding: 22px;
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 16px;
    }
    .artifact-title {
      font-size: 1.35rem;
      font-weight: 950;
      line-height: 1.08;
    }
    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill {
      border: 2px solid #8c8c8c;
      border-radius: 999px;
      padding: 5px 10px;
      color: var(--muted);
      font-weight: 850;
    }
    .pill.category {
      border-color: var(--accent);
      color: var(--accent);
    }
    .artifact-meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: auto;
      font-size: .86rem;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .button {
      border: 3px solid var(--line);
      border-radius: 8px;
      background: var(--accent);
      color: white;
      box-shadow: 5px 5px 0 var(--line);
      padding: 12px 16px;
      font-weight: 950;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
    }
    .button.secondary {
      background: white;
      color: var(--text);
    }
    .artifact-heading {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
      margin-bottom: 24px;
    }
    .artifact-heading dl {
      display: grid;
      grid-template-columns: repeat(3, auto);
      gap: 24px;
      margin: 0;
    }
    dt {
      color: var(--muted);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .07em;
      font-size: .82rem;
    }
    dd {
      margin: 4px 0 0;
      font-weight: 950;
      font-size: 1.1rem;
    }
    .viewer-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
      gap: 24px;
      align-items: start;
    }
    .frame-wrap {
      min-height: 720px;
      border: 3px solid var(--line);
      background: white;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
    }
    .frame-toolbar {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 2px solid var(--line);
      font-weight: 900;
      overflow: hidden;
    }
    .frame-toolbar code {
      max-width: 70%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .artifact-frame {
      flex: 1;
      width: 100%;
      border: 0;
      background: white;
    }
    .details {
      display: grid;
      gap: 24px;
    }
    .details section {
      padding: 20px;
    }
    .details-list {
      display: grid;
      gap: 16px;
      margin: 20px 0 0;
    }
    .version-list {
      display: grid;
      gap: 12px;
      margin-top: 18px;
    }
    .version-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid var(--soft-line);
      padding-top: 12px;
    }
    .version-row div {
      display: grid;
      gap: 4px;
    }
    .empty {
      padding: 32px;
      color: var(--muted);
      font-weight: 850;
    }
    @media (max-width: 820px) {
      .artifact-heading, .viewer-layout {
        grid-template-columns: 1fr;
      }
      .artifact-heading dl {
        grid-template-columns: 1fr;
      }
      .frame-wrap {
        min-height: 560px;
      }
    }
  `;
}
