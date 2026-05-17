# Railway Deployment

Railway runs the Node/file-store server. It is a good one-click target for people who want the OSS engine without Cloudflare-specific D1/R2 setup.

## Deploy Button

Create a Railway template from this GitHub repo, then replace the placeholder template code:

```md
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/agent-artifact-engine?utm_campaign=agent-artifact-engine)
```

If you have a Railway referral link, append its referral parameter to the template URL:

```md
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/agent-artifact-engine?utm_campaign=agent-artifact-engine&referralCode=YOUR_CODE)
```

Do not publish the README button until the template exists, otherwise it will send users to a missing template.

## Template Settings

Use the included `railway.toml`:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check: `/health`
- Public networking: enabled
- Volume mount: set `DATA_DIR` to the mounted path, for example `/data`

Suggested variables:

```sh
HOST=0.0.0.0
PORT=3000
DATA_DIR=/data
PUBLIC_BASE_URL=https://your-service.up.railway.app
ARTIFACT_BASE_URL=https://your-service.up.railway.app
PUBLISH_TOKEN=<generated secret>
ARTIFACT_ALLOW_SCRIPTS=false
```

The Railway template is still OSS self-hosting. It does not add SaaS accounts, email, moderation, billing, admin tooling, or shared infrastructure.
