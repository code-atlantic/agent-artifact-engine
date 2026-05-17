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
- Volume mount: attach a persistent volume at `/data`

Required template variable:

```sh
PUBLISH_TOKEN=${{ secret(64) }}
```

Optional template variables:

```sh
DATA_DIR=/data
MAX_SOURCE_BYTES=1048576
ARTIFACT_ALLOW_SCRIPTS=false
```

`DATA_DIR` may be omitted if the volume is attached, because the app uses Railway's `RAILWAY_VOLUME_MOUNT_PATH` automatically. `PUBLIC_BASE_URL` and `ARTIFACT_BASE_URL` may also be omitted because the app uses Railway's public domain automatically.

The Railway template is still OSS self-hosting. It does not add SaaS accounts, email, moderation, billing, admin tooling, or shared infrastructure.

## CLI Smoke Deploy

Once the CLI is logged in:

```sh
railway login
railway init
railway volume add --mount-path /data
railway variables --set "ARTIFACT_ALLOW_SCRIPTS=false"
railway variables --set "PUBLISH_TOKEN=<generated secret>"
railway up
railway domain
```

Use the resulting service as the live demo project when publishing the template.
