# Railway Deployment

Railway runs the Node/file-store server. It is a good one-click target for people who want the OSS engine without Cloudflare-specific D1/R2 setup.

## Deploy Button

The CLI can deploy this repo with `railway up`, but publishing a reusable Railway template is a dashboard action. Create a Railway template from this GitHub repo, publish it from Workspace Settings -> Templates, then replace the placeholder template code:

```md
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/agent-artifact-engine?utm_campaign=agent-artifact-engine)
```

If you have a Railway referral link, append its referral parameter to the template URL:

```md
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/agent-artifact-engine?utm_campaign=agent-artifact-engine&referralCode=YOUR_CODE)
```

Do not publish the README button until the template exists, otherwise it will send users to a missing template.

The CLI command `railway deploy -t <template>` deploys an already-published template into a project. It does not publish this repo as a new template.

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

## CLI Smoke Deploy

Once the CLI is logged in:

```sh
railway login
railway init
railway volume add --mount-path /data
railway variables --set "HOST=0.0.0.0" --set "DATA_DIR=/data" --set "ARTIFACT_ALLOW_SCRIPTS=false"
railway variables --set "PUBLISH_TOKEN=<generated secret>"
railway up
railway domain
```

Use the resulting service as the live demo project when publishing the template.
