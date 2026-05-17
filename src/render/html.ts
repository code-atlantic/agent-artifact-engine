export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeHtml(html: string, title = "Artifact"): string {
  const trimmed = html.trim();
  if (/<!doctype html>/i.test(trimmed)) return trimmed;
  if (/<html[\s>]/i.test(trimmed)) return `<!doctype html>\n${trimmed}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body>
${trimmed}
</body>
</html>`;
}

export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
