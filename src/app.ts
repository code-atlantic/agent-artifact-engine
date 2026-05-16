import fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { makeNonce, appCsp, rawArtifactCsp } from "./security.js";
import { FileArtifactStore } from "./storage.js";
import { artifactUrls, shareUrl } from "./url.js";
import { validateCreateArtifact, validateCreateShare, validateCreateVersion } from "./validation.js";
import { renderArtifactViewer, renderEmbed, renderHome, renderNotFound } from "./views.js";

interface AppDependencies {
  config?: AppConfig;
  store?: FileArtifactStore;
}

interface IdParams {
  id: string;
}

interface SlugParams {
  slug: string;
}

interface TokenParams {
  token: string;
}

interface ArtifactIdParams {
  artifactId: string;
}

interface VersionParams {
  versionId: string;
}

interface TaxonomyParams {
  value: string;
}

interface RawQuery {
  share?: string;
  download?: string;
}

export function buildApp(dependencies: AppDependencies = {}) {
  const config = dependencies.config ?? loadConfig();
  const store = dependencies.store ?? new FileArtifactStore(config.dataDir);
  const app = fastify({ logger: false });

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });

  app.get("/health", async () => ({
    ok: true,
    service: "agent-artifact-engine"
  }));

  app.get("/", async (_request, reply) => {
    const nonce = makeNonce();
    reply.header("Content-Security-Policy", appCsp(config, nonce));
    reply.type("text/html; charset=utf-8");
    return renderHome(config, await store.listVisible(), nonce);
  });

  app.get<{ Params: TaxonomyParams }>("/tag/:value", async (request, reply) => {
    const nonce = makeNonce();
    reply.header("Content-Security-Policy", appCsp(config, nonce));
    reply.type("text/html; charset=utf-8");
    return renderHome(config, await store.listVisible(20, { tag: request.params.value }), nonce);
  });

  app.get<{ Params: TaxonomyParams }>("/cat/:value", async (request, reply) => {
    const nonce = makeNonce();
    reply.header("Content-Security-Policy", appCsp(config, nonce));
    reply.type("text/html; charset=utf-8");
    return renderHome(config, await store.listVisible(20, { category: request.params.value }), nonce);
  });

  app.get("/v1/tags", async () => ({
    tags: await store.listTaxonomy("tag")
  }));

  app.get("/v1/categories", async () => ({
    categories: await store.listTaxonomy("category")
  }));

  app.post("/v1/artifacts", async (request, reply) => {
    if (!requirePublishAuth(config, request, reply)) return reply;

    const validation = validateCreateArtifact(request.body, config.maxSourceBytes);
    if (!validation.ok) return reply.code(400).send({ error: validation.message });

    const ownerId = currentOwnerId(config, request, validation.value.ownerId);
    const record = await store.createArtifact({ ...validation.value, ownerId });
    const share = await store.createShare(record.artifact.id, { permission: "view" });

    return reply.code(201).send({
      artifact: record.artifact,
      currentVersion: record.currentVersion,
      urls: artifactUrls(config, record.artifact, record.currentVersion),
      share: share ? { ...share, url: shareUrl(config, share) } : undefined
    });
  });

  app.get<{ Params: IdParams }>("/v1/artifacts/:id", async (request, reply) => {
    const record = await store.getById(request.params.id);
    if (!record) return reply.code(404).send({ error: "Artifact not found." });
    if (record.artifact.visibility === "private" && !requirePublishAuth(config, request, reply)) return reply;

    return {
      artifact: record.artifact,
      currentVersion: record.currentVersion,
      urls: artifactUrls(config, record.artifact, record.currentVersion)
    };
  });

  app.post<{ Params: IdParams }>("/v1/artifacts/:id/versions", async (request, reply) => {
    if (!requirePublishAuth(config, request, reply)) return reply;

    const validation = validateCreateVersion(request.body, config.maxSourceBytes);
    if (!validation.ok) return reply.code(400).send({ error: validation.message });

    const record = await store.createVersion(request.params.id, validation.value);
    if (!record) return reply.code(404).send({ error: "Artifact not found." });

    return reply.code(201).send({
      artifact: record.artifact,
      currentVersion: record.currentVersion,
      urls: artifactUrls(config, record.artifact, record.currentVersion)
    });
  });

  app.post<{ Params: IdParams }>("/v1/artifacts/:id/share", async (request, reply) => {
    if (!requirePublishAuth(config, request, reply)) return reply;

    const validation = validateCreateShare(request.body);
    if (!validation.ok) return reply.code(400).send({ error: validation.message });

    const share = await store.createShare(request.params.id, validation.value);
    if (!share) return reply.code(404).send({ error: "Artifact not found." });

    return reply.code(201).send({ ...share, url: shareUrl(config, share) });
  });

  app.get<{ Params: SlugParams }>("/a/:slug", async (request, reply) => {
    const record = await store.getBySlug(request.params.slug);
    if (!record || record.artifact.visibility === "private") return sendNotFound(reply, config);

    const nonce = makeNonce();
    const versions = await store.listVersions(record.artifact.id);
    reply.header("Content-Security-Policy", appCsp(config, nonce));
    reply.type("text/html; charset=utf-8");
    return renderArtifactViewer(config, record.artifact, record.currentVersion, nonce, { versions });
  });

  app.get<{ Params: TokenParams }>("/s/:token", async (request, reply) => {
    const share = await store.getShareByToken(request.params.token);
    if (!share) return sendNotFound(reply, config);

    const nonce = makeNonce();
    const versions = await store.listVersions(share.artifact.id);
    reply.header("Content-Security-Policy", appCsp(config, nonce));
    reply.type("text/html; charset=utf-8");
    return renderArtifactViewer(config, share.artifact, share.version, nonce, {
      share,
      shareToken: request.params.token,
      versions
    });
  });

  app.get<{ Params: ArtifactIdParams }>("/embed/:artifactId", async (request, reply) => {
    const record = await store.getById(request.params.artifactId);
    if (!record || record.artifact.visibility === "private") return sendNotFound(reply, config);

    reply.header("Content-Security-Policy", "default-src 'self'; frame-src 'self'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'");
    reply.type("text/html; charset=utf-8");
    return renderEmbed(config, record.artifact, record.currentVersion);
  });

  app.get<{ Params: VersionParams; Querystring: RawQuery }>("/raw/:versionId", async (request, reply) => {
    const record = await store.getByVersionId(request.params.versionId);
    if (!record) return reply.code(404).type("text/plain").send("Artifact version not found.");

    if (record.artifact.visibility === "private") {
      const canView = request.query.share ? await store.isValidShareForArtifact(request.query.share, record.artifact.id) : false;
      if (!canView && !hasPublishAuth(config, request)) {
        return reply.code(401).send({ error: "Share token or publish token required." });
      }
    }

    reply.header("Content-Security-Policy", rawArtifactCsp(config));
    reply.header("Cross-Origin-Resource-Policy", "cross-origin");
    reply.header("Cache-Control", record.artifact.visibility === "private" ? "private, no-store" : "public, max-age=31536000, immutable");

    if (request.query.download === "1") {
      reply.header("Content-Disposition", `attachment; filename="${record.artifact.slug}.html"`);
    }

    reply.type("text/html; charset=utf-8");
    return store.readVersionHtml(record.version);
  });

  app.get<{ Params: VersionParams }>("/thumb/:versionId", async (request, reply) => {
    const record = await store.getByVersionId(request.params.versionId);
    if (!record || record.artifact.visibility === "private") return reply.code(404).type("text/plain").send("Thumbnail not found.");

    const thumbnail = await store.readThumbnail(record.version);
    if (!thumbnail) return reply.code(404).type("text/plain").send("Thumbnail not found.");

    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    reply.type("image/png");
    return thumbnail;
  });

  app.setNotFoundHandler(async (_request, reply) => sendNotFound(reply, config));

  return app;
}

function sendNotFound(reply: FastifyReply, config: AppConfig) {
  const nonce = makeNonce();
  reply.code(404);
  reply.header("Content-Security-Policy", appCsp(config, nonce));
  reply.type("text/html; charset=utf-8");
  return renderNotFound(nonce);
}

function requirePublishAuth(config: AppConfig, request: FastifyRequest, reply: FastifyReply): boolean {
  if (!config.publishToken) return true;
  if (hasPublishAuth(config, request)) return true;

  reply.code(401).send({ error: "Publish token required." });
  return false;
}

function hasPublishAuth(config: AppConfig, request: FastifyRequest): boolean {
  if (!config.publishToken) return false;

  const auth = headerString(request.headers.authorization);
  const token = headerString(request.headers["x-publish-token"]);
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;

  return bearer === config.publishToken || token === config.publishToken;
}

function currentOwnerId(config: AppConfig, request: FastifyRequest, fallback?: string): string {
  if (config.publishToken) return "shared-token";
  return headerString(request.headers["x-owner-id"]) ?? fallback ?? "anonymous";
}

function headerString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
