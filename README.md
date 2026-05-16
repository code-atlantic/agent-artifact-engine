# Agent Artifact Engine

Self-hostable engine for publishing immutable HTML and safe MDX artifacts.

This repo is the OSS core. It intentionally does not include hosted SaaS concerns such as account signup, email token queues, billing, plan limits, admin portals, content scanning policy, abuse adjudication, or production-specific Cloudflare wiring.

## Quick Start

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

Publish an artifact:

```sh
curl -X POST http://127.0.0.1:3000/v1/artifacts \
  -H "content-type: application/json" \
  -d '{
    "title": "Hello Artifact",
    "format": "html",
    "visibility": "public",
    "html": "<h1>Hello from an agent</h1><p>This is an immutable artifact.</p>"
  }'
```

## Core Features

- HTML and safe MDX publishing.
- Immutable artifact versions.
- Local file-backed metadata and blob storage.
- Public, unlisted, and private visibility.
- Share tokens for private/unlisted delivery.
- Sandboxed viewer and raw artifact routes.
- Static export for read-only hosting.
- Optional shared-token auth for self-hosted write protection.

## Environment

| Name | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `HOST` | `0.0.0.0` | HTTP host. |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:<PORT>` | Public viewer URL base. |
| `ARTIFACT_BASE_URL` | `PUBLIC_BASE_URL` | Raw artifact URL base. |
| `DATA_DIR` | `.data` | Local metadata and blob storage. |
| `MAX_SOURCE_BYTES` | `1048576` | Maximum HTML or MDX source payload size. |
| `PUBLISH_TOKEN` | empty | Optional shared token for write/private-read routes. |
| `ARTIFACT_ALLOW_SCRIPTS` | `false` | If true, sandboxed artifacts may run scripts. |

When `PUBLISH_TOKEN` is set, send either:

```http
Authorization: Bearer <token>
```

or:

```http
x-publish-token: <token>
```

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | Recent public artifacts. |
| `GET` | `/health` | Health check. |
| `POST` | `/v1/artifacts` | Create an artifact. |
| `GET` | `/v1/artifacts/:id` | Read artifact metadata. |
| `POST` | `/v1/artifacts/:id/versions` | Add an immutable version. |
| `POST` | `/v1/artifacts/:id/share` | Create a share token. |
| `GET` | `/v1/tags` | List public tag counts. |
| `GET` | `/v1/categories` | List public category counts. |
| `GET` | `/a/:slug` | Artifact viewer. |
| `GET` | `/s/:token` | Share-token viewer. |
| `GET` | `/raw/:versionId` | Raw artifact HTML. |
| `GET` | `/embed/:artifactId` | Bare embed page. |

## Static Export

```sh
DATA_DIR=.data STATIC_BASE_URL=http://127.0.0.1:4173 npm run static:export
npm run static:serve -- --dir static-export --port 4173
```

Static export is read-only. New publishes require running the dynamic server and exporting again.

## Boundary

Core exposes primitives and optional hooks. Hosted products should implement their own identity, moderation, analytics, billing, admin, and policy layers around this engine.
