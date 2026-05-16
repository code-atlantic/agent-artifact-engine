# Core Boundary

This repo contains the self-hostable artifact engine.

## Included

- Artifact and version types.
- Local file-backed storage.
- HTML normalization.
- Safe MDX rendering.
- URL, slug, taxonomy, and validation helpers.
- Sandboxed viewer and raw artifact delivery.
- Share tokens.
- Optional shared-token auth adapter.
- Static export.

## Not Included

- Hosted account signup or login.
- Email verification/token queues.
- API key recovery or rotation.
- Admin portals.
- Content scanning policy.
- Moderation queues or quarantine decisions.
- Abuse adjudication and trace-retention policy.
- Billing, plans, limits, trust tiers, or entitlements.
- Hosted analytics.
- Product-specific branding.
- Production Cloudflare resources or secrets.

Hosted SaaS products should wrap this engine and provide those concerns outside the core.
