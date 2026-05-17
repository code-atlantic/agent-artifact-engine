# Deployment

The engine can run as a dynamic Node service, a dynamic Cloudflare Worker, or as a read-only static export.

## Local Node

```sh
npm install
npm run dev
```

Production-style local run:

```sh
npm run build
PORT=3000 DATA_DIR=.data npm start
```

## Static Export

Static export reads the local file store and writes plain files.

```sh
STATIC_BASE_URL=https://example.com npm run static:export
```

Upload `static-export/` to any static host.

Local preview:

```sh
npm run static:serve -- --dir static-export --port 4173
```

## Cloudflare Pages

Cloudflare Pages can serve the static export directly:

```sh
STATIC_BASE_URL=https://your-project.pages.dev npm run static:export
npm run cf:pages:deploy -- --project-name your-project
```

## Cloudflare Workers

The repo includes a Worker adapter backed by D1 and R2:

```sh
cp .dev.vars.example .dev.vars
npm run cf:worker:migrate
npm run cf:worker:dev
```

Deploy:

```sh
npm run cf:worker:deploy
```

See `docs/cloudflare.md`.

## Railway

Railway runs the Node server with the file store:

```sh
railway up
```

Use `railway.toml`, attach a volume, and set `DATA_DIR` to the mounted path. See `docs/railway.md`.

## One-Click Buttons

See `docs/one-click-deploy.md` for Cloudflare and Railway button snippets.

## Container Or VM

```sh
npm ci
npm run build
npm prune --omit=dev
PORT=3000 HOST=0.0.0.0 DATA_DIR=/var/lib/agent-artifacts node dist/http/server.js
```

Mount `DATA_DIR` on persistent storage.

## Platform Adapters

Cloudflare, Postgres, S3-compatible blob storage, queues, analytics, and hosted identity should be implemented as adapters or wrapper services. They are not required by the core engine.
