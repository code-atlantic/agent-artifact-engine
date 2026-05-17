#!/usr/bin/env node

import process from "node:process";

type JsonObject = Record<string, unknown>;

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

const baseUrl = trimTrailingSlash(process.env.AGENT_ARTIFACT_ENGINE_URL ?? "http://127.0.0.1:3000");
const token = process.env.AGENT_ARTIFACT_ENGINE_TOKEN;

const tools: McpTool[] = [
  {
    name: "agent_artifact_engine_health",
    description: "Check health for the configured Agent Artifact Engine instance.",
    inputSchema: objectSchema({})
  },
  {
    name: "agent_artifact_engine_publish_artifact",
    description: "Publish an HTML or safe MDX artifact to the configured engine.",
    inputSchema: artifactSchema()
  },
  {
    name: "agent_artifact_engine_get_artifact",
    description: "Read artifact metadata and URLs by artifact id.",
    inputSchema: objectSchema(
      {
        id: { type: "string", minLength: 1 }
      },
      ["id"]
    )
  },
  {
    name: "agent_artifact_engine_create_share",
    description: "Create a tokenized share link for an artifact.",
    inputSchema: objectSchema(
      {
        artifactId: { type: "string", minLength: 1 },
        permission: { type: "string", enum: ["view", "comment", "fork"] },
        expiresAt: { type: "string", format: "date-time" }
      },
      ["artifactId"]
    )
  },
  {
    name: "agent_artifact_engine_get_tags",
    description: "List public artifact tags and counts.",
    inputSchema: objectSchema({})
  },
  {
    name: "agent_artifact_engine_get_categories",
    description: "List public artifact categories and counts.",
    inputSchema: objectSchema({})
  }
];

let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk: Buffer | string) => {
  const nextChunk = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
  buffer = Buffer.concat([buffer, nextChunk]);
  readBufferedMessages().catch((error) => {
    writeLog(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  });
});

process.stdin.on("end", () => {
  process.exit(0);
});

async function readBufferedMessages(): Promise<void> {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;

    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const lengthMatch = header.match(/content-length:\s*(\d+)/i);
    if (!lengthMatch) throw new Error("MCP frame missing Content-Length header.");

    const contentLength = Number(lengthMatch[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    if (buffer.length < messageEnd) return;

    const rawMessage = buffer.subarray(messageStart, messageEnd).toString("utf8");
    buffer = buffer.subarray(messageEnd);

    await handleMessage(JSON.parse(rawMessage) as JsonRpcRequest);
  }
}

async function handleMessage(message: JsonRpcRequest): Promise<void> {
  if (!message.method) return respondError(message.id, -32600, "Invalid request.");
  if (message.method.startsWith("notifications/")) return;

  try {
    switch (message.method) {
      case "initialize":
        return respond(message.id, {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "@agent-artifact-engine/mcp",
            version: "0.1.0"
          }
        });
      case "ping":
        return respond(message.id, {});
      case "tools/list":
        return respond(message.id, { tools });
      case "tools/call": {
        const params = readObject(message.params);
        const name = readString(params.name);
        const args = readObject(params.arguments ?? {});
        return respond(message.id, await callTool(name, args));
      }
      default:
        return respondError(message.id, -32601, `Unknown method: ${message.method}`);
    }
  } catch (error) {
    return respondError(message.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(name: string, args: JsonObject): Promise<JsonObject> {
  switch (name) {
    case "agent_artifact_engine_health":
      return textResult(await apiRequest("/health"));
    case "agent_artifact_engine_publish_artifact":
      return textResult(await apiRequest("/v1/artifacts", { method: "POST", body: normalizeArtifactArgs(args), token }));
    case "agent_artifact_engine_get_artifact":
      return textResult(await apiRequest(`/v1/artifacts/${encodeURIComponent(readString(args.id))}`, { token }));
    case "agent_artifact_engine_create_share":
      return textResult(
        await apiRequest(`/v1/artifacts/${encodeURIComponent(readString(args.artifactId))}/share`, {
          method: "POST",
          body: pick(args, ["permission", "expiresAt"]),
          token
        })
      );
    case "agent_artifact_engine_get_tags":
      return textResult(await apiRequest("/v1/tags"));
    case "agent_artifact_engine_get_categories":
      return textResult(await apiRequest("/v1/categories"));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function apiRequest(path: string, options: { method?: "GET" | "POST"; body?: unknown; token?: string } = {}): Promise<unknown> {
  const headers = new Headers({ accept: "application/json" });
  const init: RequestInit = { method: options.method ?? "GET", headers };

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  if (options.token) headers.set("authorization", `Bearer ${options.token}`);

  const response = await fetch(`${baseUrl}${path}`, init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

function normalizeArtifactArgs(args: JsonObject): JsonObject {
  const category = typeof args.category === "string" ? args.category : undefined;
  const categories = Array.isArray(args.categories) ? args.categories : category ? [category] : undefined;
  return {
    ...pick(args, ["title", "description", "format", "html", "mdx", "content", "visibility", "slug", "tags", "metadata", "ownerId"]),
    categories
  };
}

function objectSchema(properties: JsonObject, required: string[] = []): JsonObject {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required
  };
}

function artifactSchema(): JsonObject {
  return objectSchema(
    {
      title: { type: "string", minLength: 1 },
      description: { type: "string" },
      format: { type: "string", enum: ["html", "mdx"] },
      html: { type: "string" },
      mdx: { type: "string" },
      content: { type: "string" },
      visibility: { type: "string", enum: ["public", "unlisted", "private"] },
      slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
      category: { type: "string" },
      categories: {
        type: "array",
        maxItems: 1,
        items: { type: "string" }
      },
      tags: {
        type: "array",
        maxItems: 6,
        items: { type: "string" }
      },
      metadata: { type: "object" },
      ownerId: { type: "string" }
    },
    ["title"]
  );
}

function textResult(value: unknown): JsonObject {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function respond(id: JsonRpcRequest["id"], result: JsonObject): void {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function respondError(id: JsonRpcRequest["id"], code: number, message: string): void {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeMessage(message: JsonObject): void {
  const payload = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
}

function writeLog(message: string): void {
  process.stderr.write(`[agent-artifact-engine-mcp] ${message}\n`);
}

function pick(source: JsonObject, keys: string[]): JsonObject {
  const result: JsonObject = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function readObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function readString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected string value.");
  return value;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
