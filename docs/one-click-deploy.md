# One-Click Deploy

## Cloudflare

The Cloudflare button can go live as soon as the repo has `wrangler.jsonc` on the default branch:

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/code-atlantic/agent-artifact-engine)
```

Cloudflare reads `wrangler.jsonc`, provisions D1/R2 bindings, and runs the Worker build. The deploy script applies D1 migrations before deploy.

## Railway

Railway buttons point at a published Railway template, not directly at arbitrary repo config. The Railway CLI can smoke-deploy the project, but template publishing happens in the Railway dashboard:

```md
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/agent-artifact-engine?utm_campaign=agent-artifact-engine)
```

Add an affiliate/referral parameter after you copy it from Railway:

```md
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/agent-artifact-engine?utm_campaign=agent-artifact-engine&referralCode=YOUR_CODE)
```

Keep the README button hidden or marked pending until the Railway template exists.
