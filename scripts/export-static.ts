import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadConfig, type AppConfig } from "../src/config.js";
import { makeNonce } from "../src/security.js";
import { FileArtifactStore } from "../src/storage.js";
import type { ArtifactRecord, ArtifactVersion } from "../src/types.js";
import { renderArtifactViewer, renderEmbed, renderHome } from "../src/views.js";

const outDir = argValue("--out") ?? process.env.STATIC_OUT_DIR ?? "static-export";
const dataDir = argValue("--data-dir") ?? process.env.DATA_DIR ?? ".data";
const baseUrl = cleanBaseUrl(argValue("--base-url") ?? process.env.STATIC_BASE_URL ?? "http://127.0.0.1:4173");
const includeUnlisted = hasFlag("--include-unlisted") || process.env.STATIC_INCLUDE_UNLISTED === "true";

const config: AppConfig = {
  ...loadConfig({
    ...process.env,
    DATA_DIR: dataDir,
    PUBLIC_BASE_URL: baseUrl,
    ARTIFACT_BASE_URL: baseUrl
  })
};
const store = new FileArtifactStore(config.dataDir);
const records = includeUnlisted ? await visibleAndUnlistedRecords(store) : await store.listVisible(1_000);

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });

await writeHtml("index.html", renderHome(config, records, makeNonce()));
await writeJson("health/index.json", { ok: true, service: "agent-artifact-engine-static", artifacts: records.length });

for (const record of records) {
  const versions = await store.listVersions(record.artifact.id);
  await writeHtml(
    `a/${record.artifact.slug}/index.html`,
    renderArtifactViewer(config, record.artifact, record.currentVersion, makeNonce(), { versions })
  );
  await writeHtml(`embed/${record.artifact.id}/index.html`, renderEmbed(config, record.artifact, record.currentVersion));

  for (const version of versions) {
    await exportVersion(record, version);
  }
}

console.log(`Exported ${records.length} artifact(s) to ${outDir}`);

async function visibleAndUnlistedRecords(store: FileArtifactStore): Promise<ArtifactRecord[]> {
  const [publicRecords, unlistedRecords] = await Promise.all([
    store.listArtifacts(1_000, { visibility: "public" }),
    store.listArtifacts(1_000, { visibility: "unlisted" })
  ]);
  return [...publicRecords, ...unlistedRecords].sort((left, right) => right.artifact.updatedAt.localeCompare(left.artifact.updatedAt));
}

async function exportVersion(record: ArtifactRecord, version: ArtifactVersion): Promise<void> {
  const html = await store.readVersionHtml(version);
  await writeHtml(`raw/${version.id}/index.html`, html);

  if (version.thumbnailStorageKey) {
    const thumbnail = await store.readThumbnail(version);
    if (thumbnail) await writeBinary(`thumb/${version.id}`, thumbnail);
  }
}

async function writeHtml(path: string, html: string): Promise<void> {
  await writeText(path, html.endsWith("\n") ? html : `${html}\n`);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(path: string, value: string): Promise<void> {
  const fullPath = join(outDir, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, value, "utf8");
}

async function writeBinary(path: string, value: Buffer): Promise<void> {
  const fullPath = join(outDir, path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, value);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
