import type { AppConfig } from "../core/config.js";
import { cleanBaseUrl } from "../core/config.js";
import type {
  Artifact,
  ArtifactRecord,
  ArtifactShare,
  ArtifactSourceFormat,
  ArtifactVersion,
  ArtifactVisibility,
  CreateShareInput
} from "../core/types.js";
import { validateCreateArtifact, validateCreateShare, validateCreateVersion } from "../core/validation.js";
import { renderArtifactSource } from "../render/source.js";
import { appCsp, makeNonce, rawArtifactCsp } from "../security/csp.js";
import { artifactUrls, shareUrl } from "../utils/url.js";
import { slugify, withNumericSuffix } from "../utils/slug.js";
import { renderArtifactViewer, renderEmbed, renderHome, renderNotFound } from "../view/pages.js";

export interface CloudflareEnv {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  PUBLIC_BASE_URL?: string;
  ARTIFACT_BASE_URL?: string;
  MAX_SOURCE_BYTES?: string;
  PUBLISH_TOKEN?: string;
  ARTIFACT_ALLOW_SCRIPTS?: string;
}

interface RawQuery {
  share?: string;
  download?: string;
}

interface RecordRow {
  artifact_id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: ArtifactVisibility;
  current_version_id: string;
  owner_id: string;
  metadata_json: string;
  artifact_created_at: string;
  artifact_updated_at: string;
  version_id: string;
  version_artifact_id: string;
  source_format: ArtifactSourceFormat;
  rendered_key: string;
  source_key: string | null;
  thumbnail_key: string | null;
  checksum: string;
  bytes: number;
  source_bytes: number;
  version_created_at: string;
  created_by: ArtifactVersion["createdBy"];
}

interface ShareRow {
  id: string;
  artifact_id: string;
  permission: ArtifactShare["permission"];
  expires_at: string | null;
  created_at: string;
}

interface TaxonomyRow {
  artifact_id: string;
  value: string;
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
};

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(error);
      return json({ error: "Internal server error." }, 500);
    }
  }
};

async function route(request: Request, env: CloudflareEnv): Promise<Response> {
  const url = new URL(request.url);
  const config = configFromEnv(env, request);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "agent-artifact-engine", runtime: "cloudflare-workers" });
  }

  if (request.method === "GET" && url.pathname === "/") {
    const nonce = makeNonce();
    return page(config, renderHome(config, await listVisible(env), nonce), 200, nonce);
  }

  if (request.method === "GET" && parts[0] === "tag" && parts[1]) {
    const nonce = makeNonce();
    return page(config, renderHome(config, await listVisible(env, 20, { tag: parts[1] }), nonce), 200, nonce);
  }

  if (request.method === "GET" && parts[0] === "cat" && parts[1]) {
    const nonce = makeNonce();
    return page(config, renderHome(config, await listVisible(env, 20, { category: parts[1] }), nonce), 200, nonce);
  }

  if (request.method === "GET" && url.pathname === "/v1/tags") {
    return json({ tags: await listTaxonomy(env, "tag") });
  }

  if (request.method === "GET" && url.pathname === "/v1/categories") {
    return json({ categories: await listTaxonomy(env, "category") });
  }

  if (request.method === "POST" && url.pathname === "/v1/artifacts") {
    const auth = requirePublishAuth(env, request);
    if (auth) return auth;

    const body = await readJson(request);
    if (!body.ok) return json({ error: body.message }, 400);

    const validation = validateCreateArtifact(body.value, config.maxSourceBytes);
    if (!validation.ok) return json({ error: validation.message }, 400);

    const ownerId = currentOwnerId(env, request, validation.value.ownerId);
    const record = await createArtifact(env, config, { ...validation.value, ownerId });
    const share = await createShare(env, record.artifact.id, { permission: "view" });

    return json(
      {
        artifact: record.artifact,
        currentVersion: record.currentVersion,
        urls: artifactUrls(config, record.artifact, record.currentVersion),
        share: { ...share, url: shareUrl(config, share) }
      },
      201
    );
  }

  if (request.method === "GET" && parts[0] === "v1" && parts[1] === "artifacts" && parts[2] && parts.length === 3) {
    const record = await getById(env, parts[2]);
    if (!record) return json({ error: "Artifact not found." }, 404);
    if (record.artifact.visibility === "private" && !hasPublishAuth(env, request)) {
      return json({ error: "Publish token required." }, 401);
    }

    return json({
      artifact: record.artifact,
      currentVersion: record.currentVersion,
      urls: artifactUrls(config, record.artifact, record.currentVersion)
    });
  }

  if (request.method === "POST" && parts[0] === "v1" && parts[1] === "artifacts" && parts[2] && parts[3] === "versions") {
    const auth = requirePublishAuth(env, request);
    if (auth) return auth;

    const body = await readJson(request);
    if (!body.ok) return json({ error: body.message }, 400);

    const validation = validateCreateVersion(body.value, config.maxSourceBytes);
    if (!validation.ok) return json({ error: validation.message }, 400);

    const record = await createVersion(env, parts[2], validation.value.source, validation.value.sourceFormat, validation.value.createdBy ?? "agent");
    if (!record) return json({ error: "Artifact not found." }, 404);

    return json(
      {
        artifact: record.artifact,
        currentVersion: record.currentVersion,
        urls: artifactUrls(config, record.artifact, record.currentVersion)
      },
      201
    );
  }

  if (request.method === "POST" && parts[0] === "v1" && parts[1] === "artifacts" && parts[2] && parts[3] === "share") {
    const auth = requirePublishAuth(env, request);
    if (auth) return auth;

    const body = await readJson(request);
    if (!body.ok) return json({ error: body.message }, 400);

    const validation = validateCreateShare(body.value);
    if (!validation.ok) return json({ error: validation.message }, 400);

    const record = await getById(env, parts[2]);
    if (!record) return json({ error: "Artifact not found." }, 404);

    const share = await createShare(env, parts[2], validation.value);
    return json({ ...share, url: shareUrl(config, share) }, 201);
  }

  if (request.method === "GET" && parts[0] === "a" && parts[1]) {
    const record = await getBySlug(env, parts[1]);
    if (!record || record.artifact.visibility === "private") return notFound(config);

    const nonce = makeNonce();
    const versions = await listVersions(env, record.artifact.id);
    return page(config, renderArtifactViewer(config, record.artifact, record.currentVersion, nonce, { versions }), 200, nonce);
  }

  if (request.method === "GET" && parts[0] === "s" && parts[1]) {
    const share = await getShareByToken(env, parts[1]);
    if (!share) return notFound(config);

    const nonce = makeNonce();
    const versions = await listVersions(env, share.artifact.id);
    return page(
      config,
      renderArtifactViewer(config, share.artifact, share.version, nonce, {
        share,
        shareToken: parts[1],
        versions
      }),
      200,
      nonce
    );
  }

  if (request.method === "GET" && parts[0] === "embed" && parts[1]) {
    const record = await getById(env, parts[1]);
    if (!record || record.artifact.visibility === "private") return notFound(config);

    return html(renderEmbed(config, record.artifact, record.currentVersion), {
      "content-security-policy": "default-src 'self'; frame-src 'self'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'"
    });
  }

  if (request.method === "GET" && parts[0] === "raw" && parts[1]) {
    return rawArtifact(env, config, parts[1], Object.fromEntries(url.searchParams) as RawQuery, request);
  }

  if (request.method === "GET" && parts[0] === "thumb" && parts[1]) {
    return thumbnail(env, parts[1]);
  }

  return notFound(config);
}

async function createArtifact(
  env: CloudflareEnv,
  config: AppConfig,
  input: {
    title: string;
    source: string;
    sourceFormat: ArtifactSourceFormat;
    description?: string;
    visibility?: ArtifactVisibility;
    slug?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
    categories?: string[];
    ownerId?: string;
  }
): Promise<ArtifactRecord> {
  const now = new Date().toISOString();
  const artifactId = id("art");
  const versionId = id("ver");
  const html = await renderArtifactSource(input.source, input.sourceFormat, input.title);
  const renderedKey = `artifacts/${artifactId}/${versionId}/rendered.html`;
  const sourceKey = `artifacts/${artifactId}/${versionId}/source.${input.sourceFormat}`;
  const checksum = await sha256Hex(html);
  const slug = await nextSlug(env, input.slug ?? input.title);

  const artifact: Artifact = {
    id: artifactId,
    slug,
    title: input.title.trim(),
    description: cleanOptionalString(input.description),
    visibility: input.visibility ?? "unlisted",
    currentVersionId: versionId,
    ownerId: input.ownerId?.trim() || "anonymous",
    metadata: input.metadata ?? {},
    tags: input.tags ?? [],
    categories: input.categories ?? [],
    createdAt: now,
    updatedAt: now
  };

  const version: ArtifactVersion = {
    id: versionId,
    artifactId,
    storageKey: renderedKey,
    sourceStorageKey: sourceKey,
    sourceFormat: input.sourceFormat,
    checksum,
    bytes: byteLength(html),
    sourceBytes: byteLength(input.source),
    createdAt: now,
    createdBy: "agent"
  };

  await env.ARTIFACTS.put(renderedKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  await env.ARTIFACTS.put(sourceKey, input.source, { httpMetadata: { contentType: sourceContentType(input.sourceFormat) } });

  const statements = [
    env.DB.prepare(
      `INSERT INTO artifacts (
        id, slug, title, description, visibility, current_version_id, owner_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      artifact.id,
      artifact.slug,
      artifact.title,
      artifact.description ?? "",
      artifact.visibility,
      artifact.currentVersionId,
      artifact.ownerId,
      JSON.stringify(artifact.metadata),
      artifact.createdAt,
      artifact.updatedAt
    ),
    env.DB.prepare(
      `INSERT INTO artifact_versions (
        id, artifact_id, source_format, rendered_key, source_key, checksum, bytes, source_bytes, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      version.id,
      version.artifactId,
      version.sourceFormat,
      version.storageKey,
      version.sourceStorageKey,
      version.checksum,
      version.bytes,
      version.sourceBytes,
      version.createdAt,
      version.createdBy
    ),
    ...taxonomyStatements(env, artifact.id, "artifact_tags", "tag", artifact.tags, now),
    ...taxonomyStatements(env, artifact.id, "artifact_categories", "category", artifact.categories, now)
  ];

  await env.DB.batch(statements);
  return { artifact, currentVersion: version };
}

async function createVersion(
  env: CloudflareEnv,
  artifactId: string,
  source: string,
  sourceFormat: ArtifactSourceFormat,
  createdBy: ArtifactVersion["createdBy"]
): Promise<ArtifactRecord | undefined> {
  const record = await getById(env, artifactId);
  if (!record) return undefined;

  const now = new Date().toISOString();
  const versionId = id("ver");
  const html = await renderArtifactSource(source, sourceFormat, record.artifact.title);
  const renderedKey = `artifacts/${artifactId}/${versionId}/rendered.html`;
  const sourceKey = `artifacts/${artifactId}/${versionId}/source.${sourceFormat}`;
  const version: ArtifactVersion = {
    id: versionId,
    artifactId,
    storageKey: renderedKey,
    sourceStorageKey: sourceKey,
    sourceFormat,
    checksum: await sha256Hex(html),
    bytes: byteLength(html),
    sourceBytes: byteLength(source),
    createdAt: now,
    createdBy
  };

  await env.ARTIFACTS.put(renderedKey, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  await env.ARTIFACTS.put(sourceKey, source, { httpMetadata: { contentType: sourceContentType(sourceFormat) } });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO artifact_versions (
        id, artifact_id, source_format, rendered_key, source_key, checksum, bytes, source_bytes, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      version.id,
      version.artifactId,
      version.sourceFormat,
      version.storageKey,
      version.sourceStorageKey,
      version.checksum,
      version.bytes,
      version.sourceBytes,
      version.createdAt,
      version.createdBy
    ),
    env.DB.prepare("UPDATE artifacts SET current_version_id = ?, updated_at = ? WHERE id = ?").bind(version.id, now, artifactId)
  ]);

  return {
    artifact: { ...record.artifact, currentVersionId: version.id, updatedAt: now },
    currentVersion: version
  };
}

async function createShare(env: CloudflareEnv, artifactId: string, input: CreateShareInput = {}): Promise<ArtifactShare> {
  const now = new Date().toISOString();
  const token = randomToken();
  const share: ArtifactShare = {
    id: id("shr"),
    artifactId,
    token,
    permission: input.permission ?? "view",
    expiresAt: cleanOptionalString(input.expiresAt),
    createdAt: now
  };

  await env.DB.prepare(
    `INSERT INTO artifact_shares (id, artifact_id, token_hash, permission, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(share.id, share.artifactId, await sha256Hex(token), share.permission, share.expiresAt ?? null, share.createdAt)
    .run();

  return share;
}

async function listVisible(env: CloudflareEnv, limit = 20, filters: { tag?: string; category?: string } = {}): Promise<ArtifactRecord[]> {
  const where = ["a.visibility = 'public'"];
  const params: Array<string | number> = [];

  if (filters.tag) {
    where.push("EXISTS (SELECT 1 FROM artifact_tags t WHERE t.artifact_id = a.id AND t.tag = ?)");
    params.push(filters.tag);
  }

  if (filters.category) {
    where.push("EXISTS (SELECT 1 FROM artifact_categories c WHERE c.artifact_id = a.id AND c.category = ?)");
    params.push(filters.category);
  }

  const rows = await env.DB.prepare(`${recordSelect()} WHERE ${where.join(" AND ")} ORDER BY a.updated_at DESC LIMIT ?`)
    .bind(...params, limit)
    .all<RecordRow>();

  return attachTaxonomy(env, rowsToRecords(rows.results ?? []));
}

async function getById(env: CloudflareEnv, artifactId: string): Promise<ArtifactRecord | undefined> {
  return firstRecord(env, "a.id = ?", artifactId);
}

async function getBySlug(env: CloudflareEnv, slug: string): Promise<ArtifactRecord | undefined> {
  return firstRecord(env, "a.slug = ?", slug);
}

async function getByVersionId(env: CloudflareEnv, versionId: string): Promise<{ artifact: Artifact; version: ArtifactVersion } | undefined> {
  const row = await env.DB.prepare(`${recordSelect()} WHERE v.id = ?`).bind(versionId).first<RecordRow>();
  if (!row) return undefined;
  const [record] = await attachTaxonomy(env, rowsToRecords([row]));
  return record ? { artifact: record.artifact, version: rowToVersion(row) } : undefined;
}

async function listVersions(env: CloudflareEnv, artifactId: string): Promise<ArtifactVersion[]> {
  const rows = await env.DB.prepare(
    `SELECT
       id AS version_id,
       artifact_id AS version_artifact_id,
       source_format,
       rendered_key,
       source_key,
       thumbnail_key,
       checksum,
       bytes,
       source_bytes,
       created_at AS version_created_at,
       created_by
     FROM artifact_versions
     WHERE artifact_id = ?
     ORDER BY created_at DESC`
  )
    .bind(artifactId)
    .all<Omit<RecordRow, "artifact_id" | "slug" | "title" | "description" | "visibility" | "current_version_id" | "owner_id" | "metadata_json" | "artifact_created_at" | "artifact_updated_at">>();

  return (rows.results ?? []).map((row) => ({
    id: row.version_id,
    artifactId: row.version_artifact_id,
    storageKey: row.rendered_key,
    sourceStorageKey: row.source_key ?? undefined,
    thumbnailStorageKey: row.thumbnail_key ?? undefined,
    sourceFormat: row.source_format,
    checksum: row.checksum,
    bytes: row.bytes,
    sourceBytes: row.source_bytes,
    createdAt: row.version_created_at,
    createdBy: row.created_by
  }));
}

async function getShareByToken(
  env: CloudflareEnv,
  token: string
): Promise<(ArtifactShare & { artifact: Artifact; version: ArtifactVersion }) | undefined> {
  const share = await env.DB.prepare(
    `SELECT id, artifact_id, permission, expires_at, created_at
     FROM artifact_shares
     WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > ?)`
  )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<ShareRow>();

  if (!share) return undefined;

  const record = await getById(env, share.artifact_id);
  if (!record) return undefined;

  return {
    id: share.id,
    artifactId: share.artifact_id,
    token,
    permission: share.permission,
    expiresAt: share.expires_at ?? undefined,
    createdAt: share.created_at,
    artifact: record.artifact,
    version: record.currentVersion
  };
}

async function isValidShareForArtifact(env: CloudflareEnv, token: string, artifactId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id
     FROM artifact_shares
     WHERE token_hash = ? AND artifact_id = ? AND (expires_at IS NULL OR expires_at > ?)`
  )
    .bind(await sha256Hex(token), artifactId, new Date().toISOString())
    .first<{ id: string }>();

  return Boolean(row);
}

async function listTaxonomy(env: CloudflareEnv, kind: "tag" | "category"): Promise<Array<{ value: string; count: number }>> {
  const table = kind === "tag" ? "artifact_tags" : "artifact_categories";
  const column = kind === "tag" ? "tag" : "category";
  const rows = await env.DB.prepare(
    `SELECT x.${column} AS value, COUNT(*) AS count
     FROM ${table} x
     JOIN artifacts a ON a.id = x.artifact_id
     WHERE a.visibility = 'public'
     GROUP BY x.${column}
     ORDER BY count DESC, value ASC`
  ).all<{ value: string; count: number }>();

  return rows.results ?? [];
}

async function rawArtifact(env: CloudflareEnv, config: AppConfig, versionId: string, query: RawQuery, request: Request): Promise<Response> {
  const record = await getByVersionId(env, versionId);
  if (!record) return text("Artifact version not found.", 404);

  if (record.artifact.visibility === "private") {
    const canView = query.share ? await isValidShareForArtifact(env, query.share, record.artifact.id) : false;
    if (!canView && !hasPublishAuth(env, request)) {
      return json({ error: "Share token or publish token required." }, 401);
    }
  }

  const object = await env.ARTIFACTS.get(record.version.storageKey);
  if (!object) return text("Artifact version not found.", 404);

  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": rawArtifactCsp(config),
    "cross-origin-resource-policy": "cross-origin",
    "cache-control": record.artifact.visibility === "private" ? "private, no-store" : "public, max-age=31536000, immutable"
  });

  if (query.download === "1") {
    headers.set("content-disposition", `attachment; filename="${record.artifact.slug}.html"`);
  }

  return new Response(object.body, { headers });
}

async function thumbnail(env: CloudflareEnv, versionId: string): Promise<Response> {
  const record = await getByVersionId(env, versionId);
  if (!record || record.artifact.visibility === "private" || !record.version.thumbnailStorageKey) {
    return text("Thumbnail not found.", 404);
  }

  const object = await env.ARTIFACTS.get(record.version.thumbnailStorageKey);
  if (!object) return text("Thumbnail not found.", 404);

  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType ?? "image/png",
    "cache-control": "public, max-age=31536000, immutable"
  });
  return new Response(object.body, { headers });
}

async function firstRecord(env: CloudflareEnv, where: string, value: string): Promise<ArtifactRecord | undefined> {
  const row = await env.DB.prepare(`${recordSelect()} WHERE ${where}`).bind(value).first<RecordRow>();
  if (!row) return undefined;
  const [record] = await attachTaxonomy(env, rowsToRecords([row]));
  return record;
}

function recordSelect(): string {
  return `SELECT
    a.id AS artifact_id,
    a.slug,
    a.title,
    a.description,
    a.visibility,
    a.current_version_id,
    a.owner_id,
    a.metadata_json,
    a.created_at AS artifact_created_at,
    a.updated_at AS artifact_updated_at,
    v.id AS version_id,
    v.artifact_id AS version_artifact_id,
    v.source_format,
    v.rendered_key,
    v.source_key,
    v.thumbnail_key,
    v.checksum,
    v.bytes,
    v.source_bytes,
    v.created_at AS version_created_at,
    v.created_by
  FROM artifacts a
  JOIN artifact_versions v ON v.id = a.current_version_id`;
}

function rowsToRecords(rows: RecordRow[]): ArtifactRecord[] {
  return rows.map((row) => ({
    artifact: {
      id: row.artifact_id,
      slug: row.slug,
      title: row.title,
      description: cleanOptionalString(row.description ?? undefined),
      visibility: row.visibility,
      currentVersionId: row.current_version_id,
      ownerId: row.owner_id,
      metadata: parseMetadata(row.metadata_json),
      tags: [],
      categories: [],
      createdAt: row.artifact_created_at,
      updatedAt: row.artifact_updated_at
    },
    currentVersion: rowToVersion(row)
  }));
}

function rowToVersion(row: Pick<RecordRow, "version_id" | "version_artifact_id" | "rendered_key" | "source_key" | "thumbnail_key" | "source_format" | "checksum" | "bytes" | "source_bytes" | "version_created_at" | "created_by">): ArtifactVersion {
  return {
    id: row.version_id,
    artifactId: row.version_artifact_id,
    storageKey: row.rendered_key,
    sourceStorageKey: row.source_key ?? undefined,
    thumbnailStorageKey: row.thumbnail_key ?? undefined,
    sourceFormat: row.source_format,
    checksum: row.checksum,
    bytes: row.bytes,
    sourceBytes: row.source_bytes,
    createdAt: row.version_created_at,
    createdBy: row.created_by
  };
}

async function attachTaxonomy(env: CloudflareEnv, records: ArtifactRecord[]): Promise<ArtifactRecord[]> {
  if (!records.length) return records;

  const ids = records.map((record) => record.artifact.id);
  const placeholders = ids.map(() => "?").join(", ");
  const [tagRows, categoryRows] = await Promise.all([
    env.DB.prepare(`SELECT artifact_id, tag AS value FROM artifact_tags WHERE artifact_id IN (${placeholders}) ORDER BY tag`).bind(...ids).all<TaxonomyRow>(),
    env.DB.prepare(`SELECT artifact_id, category AS value FROM artifact_categories WHERE artifact_id IN (${placeholders}) ORDER BY category`).bind(...ids).all<TaxonomyRow>()
  ]);

  const tags = groupTaxonomy(tagRows.results ?? []);
  const categories = groupTaxonomy(categoryRows.results ?? []);

  return records.map((record) => ({
    ...record,
    artifact: {
      ...record.artifact,
      tags: tags.get(record.artifact.id) ?? [],
      categories: categories.get(record.artifact.id) ?? []
    }
  }));
}

function groupTaxonomy(rows: TaxonomyRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.artifact_id) ?? [];
    list.push(row.value);
    grouped.set(row.artifact_id, list);
  }
  return grouped;
}

async function nextSlug(env: CloudflareEnv, value: string): Promise<string> {
  const baseSlug = slugify(value);
  let slug = baseSlug;
  let suffix = 1;

  while (await slugExists(env, slug)) {
    slug = withNumericSuffix(baseSlug, suffix);
    suffix += 1;
  }

  return slug;
}

async function slugExists(env: CloudflareEnv, slug: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM artifacts WHERE slug = ?").bind(slug).first<{ id: string }>();
  return Boolean(row);
}

function taxonomyStatements(
  env: CloudflareEnv,
  artifactId: string,
  table: "artifact_tags" | "artifact_categories",
  column: "tag" | "category",
  values: string[],
  createdAt: string
): D1PreparedStatement[] {
  return values.map((value) =>
    env.DB.prepare(`INSERT INTO ${table} (artifact_id, ${column}, created_at) VALUES (?, ?, ?)`).bind(artifactId, value, createdAt)
  );
}

function configFromEnv(env: CloudflareEnv, request: Request): AppConfig {
  const origin = new URL(request.url).origin;
  const publicBaseUrl = cleanBaseUrl(env.PUBLIC_BASE_URL || origin);
  return {
    host: "0.0.0.0",
    port: 0,
    publicBaseUrl,
    artifactBaseUrl: cleanBaseUrl(env.ARTIFACT_BASE_URL || publicBaseUrl),
    dataDir: "",
    maxSourceBytes: parseInteger(env.MAX_SOURCE_BYTES, 1024 * 1024),
    publishToken: env.PUBLISH_TOKEN || undefined,
    artifactAllowScripts: env.ARTIFACT_ALLOW_SCRIPTS === "true"
  };
}

function page(config: AppConfig, body: string, status = 200, nonce = makeNonce()): Response {
  return html(body, { "content-security-policy": appCsp(config, nonce) }, status);
}

function html(body: string, headers: Record<string, string>, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      ...headers
    }
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

function notFound(config: AppConfig): Response {
  const nonce = makeNonce();
  return html(renderNotFound(nonce), { "content-security-policy": appCsp(config, nonce) }, 404);
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, message: "Expected a JSON request body." };
  }
}

function requirePublishAuth(env: CloudflareEnv, request: Request): Response | undefined {
  if (!env.PUBLISH_TOKEN) return undefined;
  if (hasPublishAuth(env, request)) return undefined;
  return json({ error: "Publish token required." }, 401);
}

function hasPublishAuth(env: CloudflareEnv, request: Request): boolean {
  const publishToken = env.PUBLISH_TOKEN;
  if (!publishToken) return false;

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
  const headerToken = request.headers.get("x-publish-token");

  return bearer === publishToken || headerToken === publishToken;
}

function currentOwnerId(env: CloudflareEnv, request: Request, fallback?: string): string {
  if (env.PUBLISH_TOKEN) return "shared-token";
  return request.headers.get("x-owner-id") ?? fallback ?? "anonymous";
}

function sourceContentType(format: ArtifactSourceFormat): string {
  return format === "mdx" ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8";
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean ? clean : undefined;
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
