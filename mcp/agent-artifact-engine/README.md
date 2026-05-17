# Agent Artifact Engine MCP Server

Small stdio MCP server that lets agents publish and share artifacts on any Agent Artifact Engine instance.

## Run With npx

```json
{
  "mcpServers": {
    "agent-artifact-engine": {
      "command": "npx",
      "args": ["-y", "agent-artifact-engine-mcp"],
      "env": {
        "AGENT_ARTIFACT_ENGINE_URL": "https://your-engine.example.com",
        "AGENT_ARTIFACT_ENGINE_TOKEN": "optional-publish-token"
      }
    }
  }
}
```

## Build From Source

```sh
npm run mcp:build
```

## Configure From Source

```json
{
  "mcpServers": {
    "agent-artifact-engine": {
      "command": "node",
      "args": ["/absolute/path/to/agent-artifact-engine/mcp/agent-artifact-engine/dist/server.js"],
      "env": {
        "AGENT_ARTIFACT_ENGINE_URL": "https://your-engine.example.com",
        "AGENT_ARTIFACT_ENGINE_TOKEN": "optional-publish-token"
      }
    }
  }
}
```

`AGENT_ARTIFACT_ENGINE_TOKEN` is required when the target engine has `PUBLISH_TOKEN` configured, and for private artifact reads.

## Tools

- `agent_artifact_engine_health`
- `agent_artifact_engine_publish_artifact`
- `agent_artifact_engine_get_artifact`
- `agent_artifact_engine_create_share`
- `agent_artifact_engine_get_tags`
- `agent_artifact_engine_get_categories`

Artifacts accept one category and up to six tags.
