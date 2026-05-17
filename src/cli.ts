#!/usr/bin/env node

import process from "node:process";
import { buildApp } from "./http/app.js";
import { loadConfig, type AppConfig } from "./core/config.js";

const version = "0.1.0";

interface CliArgs {
  help?: boolean;
  version?: boolean;
  host?: string;
  port?: string;
  dataDir?: string;
  publicBaseUrl?: string;
  artifactBaseUrl?: string;
  publishToken?: string;
  allowScripts?: boolean;
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Run `agent-artifact-engine --help` for usage.");
  process.exit(1);
}

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.version) {
  console.log(version);
  process.exit(0);
}

const env = {
  ...process.env,
  HOST: args.host ?? process.env.HOST ?? "127.0.0.1",
  PORT: args.port ?? process.env.PORT ?? "3000",
  DATA_DIR: args.dataDir ?? process.env.DATA_DIR ?? ".data",
  PUBLIC_BASE_URL: args.publicBaseUrl ?? process.env.PUBLIC_BASE_URL,
  ARTIFACT_BASE_URL: args.artifactBaseUrl ?? process.env.ARTIFACT_BASE_URL,
  PUBLISH_TOKEN: args.publishToken ?? process.env.PUBLISH_TOKEN,
  ARTIFACT_ALLOW_SCRIPTS: args.allowScripts ? "true" : process.env.ARTIFACT_ALLOW_SCRIPTS
};

const config = loadConfig(env);
const app = buildApp({ config });

try {
  await app.listen({ host: config.host, port: config.port });
  printReady(config);
} catch (error) {
  console.error(error);
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "-v":
      case "--version":
        parsed.version = true;
        break;
      case "--host":
        parsed.host = readValue(argv, ++index, arg);
        break;
      case "--port":
        parsed.port = readValue(argv, ++index, arg);
        break;
      case "--data-dir":
        parsed.dataDir = readValue(argv, ++index, arg);
        break;
      case "--public-base-url":
        parsed.publicBaseUrl = readValue(argv, ++index, arg);
        break;
      case "--artifact-base-url":
        parsed.artifactBaseUrl = readValue(argv, ++index, arg);
        break;
      case "--publish-token":
        parsed.publishToken = readValue(argv, ++index, arg);
        break;
      case "--allow-scripts":
        parsed.allowScripts = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function readValue(argv: string[], index: number, option: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
  return value;
}

function printReady(config: AppConfig): void {
  console.log(`Agent Artifact Engine listening at ${config.publicBaseUrl}`);
  console.log(`Data directory: ${config.dataDir}`);
  console.log("Publish endpoint: POST /v1/artifacts");
}

function printHelp(): void {
  console.log(`Agent Artifact Engine ${version}

Usage:
  agent-artifact-engine [options]

Options:
  --host <host>                  Host to listen on. Defaults to 127.0.0.1.
  --port <port>                  Port to listen on. Defaults to 3000.
  --data-dir <path>              File-backed storage directory. Defaults to .data.
  --public-base-url <url>        Public viewer URL base.
  --artifact-base-url <url>      Raw artifact URL base.
  --publish-token <token>        Optional shared token for write/private-read routes.
  --allow-scripts                Allow scripts in sandboxed artifacts.
  -v, --version                  Print version.
  -h, --help                     Print help.

Examples:
  npx agent-artifact-engine
  npx agent-artifact-engine --port 3107 --data-dir .agent-artifacts
`);
}
