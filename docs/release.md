# Release Process

Use `develop` for active work and `main` for release-ready code.

## Branch Flow

```sh
git switch develop
git pull
```

Open PRs into `develop` while iterating. Merge `develop` into `main` when the next release is ready.

## Versioning

Root and MCP package versions should stay in lockstep:

```sh
npm version patch --no-git-tag-version
npm --prefix mcp/agent-artifact-engine version patch --no-git-tag-version
```

Use normal semver bumps: `patch`, `minor`, or `major`.

## Publish

After `main` is green, create an annotated tag from `main`:

```sh
git switch main
git pull
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Tag pushes run the release workflow and publish both npm packages. The GitHub repo needs an `NPM_TOKEN` secret with publish access; use an npm automation token if 2FA is enabled.

## Local Fallback

If publishing manually, make sure you are in the OSS repo:

```sh
cd /Users/danieliser/Projects/agent-artifact-engine
npm publish
cd mcp/agent-artifact-engine && npm publish
```

If npm says the package is private, you are probably in the hosted service repo instead of this OSS repo.
