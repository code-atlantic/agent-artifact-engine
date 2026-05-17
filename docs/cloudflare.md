# Cloudflare Deployment

Cloudflare is a supported OSS deployment target, but it is not a hosted SaaS framework.

This repo includes two Cloudflare paths:

- **Workers + D1 + R2** for a dynamic self-hosted artifact API.
- **Pages static export** for a read-only artifact archive.

Neither path includes hosted-provider concerns such as account signup, email, moderation queues, billing, admin review, usage plans, or shared operational policy.

## Deploy To Cloudflare

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/code-atlantic/agent-artifact-engine)
```

Cloudflare reads `wrangler.jsonc`, provisions the D1 database and R2 bucket, and deploys the Worker. The package `deploy` script runs D1 migrations before `wrangler deploy`.

For manual setup:

```sh
cp .dev.vars.example .dev.vars
wrangler d1 create agent-artifact-engine
wrangler r2 bucket create agent-artifact-engine-artifacts
```

Update `wrangler.jsonc` with the D1 `database_id`, then run:

```sh
npm run cf:worker:migrate
npm run cf:worker:dev
npm run cf:worker:deploy
```

Use `wrangler secret put PUBLISH_TOKEN` for production write protection.

`PUBLIC_BASE_URL` and `ARTIFACT_BASE_URL` are optional. If omitted, the Worker uses the incoming request origin.

## Worker Runtime

The Worker adapter uses:

- D1 for artifact metadata, versions, shares, tags, and categories.
- R2 for rendered HTML, original source, thumbnails, and future file blobs.
- Core validation, rendering, CSP, URL, taxonomy, and view helpers from the engine.
- The same core routes as the Node server, including `POST /v1/artifacts`, `/a/:slug`, `/s/:token`, and `/raw/:versionId`.

## Cloudflare Pages

Use this when you want a read-only artifact archive on Cloudflare's CDN.

1. Export artifacts from the local file store:

```sh
DATA_DIR=.data \
STATIC_BASE_URL=https://your-project.pages.dev \
npm run static:export
```

2. Preview locally with Wrangler:

```sh
npm run cf:pages:dev
```

3. Deploy:

```sh
npm run cf:pages:deploy -- --project-name your-project
```

If you prefer an explicit config file, copy the example:

```sh
cp cloudflare/wrangler.pages.example.jsonc wrangler.jsonc
```

Then adjust `name` and deploy with:

```sh
npm run cf:pages:deploy
```

## What Static Pages Includes

The export writes:

- `index.html`
- `a/<slug>/index.html`
- `raw/<versionId>/index.html`
- `embed/<artifactId>/index.html`
- `thumb/<versionId>` when thumbnails exist
- `health/index.json`

There is no publish API on the static export. Publish through the Node server, run `npm run static:export`, then deploy the updated output.

## D1 Schema

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'unlisted', 'public')),
  current_version_id TEXT NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'anonymous',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  source_format TEXT NOT NULL CHECK (source_format IN ('html', 'mdx')),
  rendered_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  thumbnail_key TEXT,
  checksum TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  source_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'agent',
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

CREATE TABLE artifact_shares (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  permission TEXT NOT NULL DEFAULT 'view',
  expires_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);

CREATE TABLE artifact_tags (
  artifact_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (artifact_id, tag)
);

CREATE TABLE artifact_categories (
  artifact_id TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (artifact_id, category)
);
```

The full migration lives at `cloudflare/migrations/0001_core.sql`.
