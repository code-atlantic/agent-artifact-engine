# Cloudflare Deployment

Cloudflare is a supported deployment target, but it is not required by the core engine.

The current OSS repo ships with a production-usable **Cloudflare Pages static export** path. A dynamic Worker/D1/R2 adapter should live as a separate adapter package or folder so it does not pull hosted SaaS policy into the core.

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

## Dynamic Worker Adapter

For a fully dynamic Cloudflare deployment, the adapter shape should be:

- Worker handles HTTP routing and CSP headers.
- D1 stores artifact metadata, versions, shares, tags, and categories.
- R2 stores rendered HTML, original source, thumbnails, and future file bundles.
- The core renderer, validation, taxonomy, URL helpers, and view helpers are imported from `agent-artifact-engine`.
- Host-owned layers provide identity, rate limiting, moderation, analytics, admin, billing, and abuse workflows.

The dynamic Worker adapter is intentionally not mixed into the core Node/file-store runtime. That keeps the OSS package portable and keeps hosted-provider policy outside the engine.

## Minimal D1 Shape For A Future Adapter

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
