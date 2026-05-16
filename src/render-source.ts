import { normalizeHtml } from "./html.js";
import { renderMdxToHtml } from "./mdx.js";
import type { ArtifactSourceFormat } from "./types.js";

export async function renderArtifactSource(source: string, sourceFormat: ArtifactSourceFormat, title: string): Promise<string> {
  return sourceFormat === "mdx" ? renderMdxToHtml(source, title) : normalizeHtml(source, title);
}
