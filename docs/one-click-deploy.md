# One-Click Deploy

## Cloudflare

The Cloudflare button can go live as soon as the repo has `wrangler.jsonc` on the default branch:

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/code-atlantic/agent-artifact-engine)
```

Cloudflare reads `wrangler.jsonc`, provisions D1/R2 bindings, and runs the Worker build. The deploy script applies D1 migrations before deploy.

## Railway

The Railway button points at the published template:

```md
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/agent-artifact-engine)
```

Minimum Railway template setup:

- GitHub service source: `code-atlantic/agent-artifact-engine`
- Public networking: HTTP enabled
- Healthcheck path: `/health`
- Persistent volume: mounted at `/data`
- Required variable: `PUBLISH_TOKEN=${{ secret(64) }}`

The app will use Railway's provided public domain and volume mount variables automatically.
