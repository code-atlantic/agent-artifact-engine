export interface AppConfig {
  host: string;
  port: number;
  publicBaseUrl: string;
  artifactBaseUrl: string;
  dataDir: string;
  maxSourceBytes: number;
  publishToken?: string;
  artifactAllowScripts: boolean;
}

type EnvMap = Record<string, string | undefined>;

const runtimeEnv = ((globalThis as { process?: { env?: EnvMap } }).process?.env ?? {}) as EnvMap;

export function loadConfig(env: EnvMap = runtimeEnv): AppConfig {
  const port = parseInteger(env.PORT, 3000);
  const publicBaseUrl = cleanBaseUrl(env.PUBLIC_BASE_URL ?? railwayPublicBaseUrl(env) ?? `http://127.0.0.1:${port}`);

  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    publicBaseUrl,
    artifactBaseUrl: cleanBaseUrl(env.ARTIFACT_BASE_URL ?? publicBaseUrl),
    dataDir: env.DATA_DIR ?? env.RAILWAY_VOLUME_MOUNT_PATH ?? ".data",
    maxSourceBytes: parseInteger(env.MAX_SOURCE_BYTES, 1024 * 1024),
    publishToken: env.PUBLISH_TOKEN || undefined,
    artifactAllowScripts: env.ARTIFACT_ALLOW_SCRIPTS === "true"
  };
}

export function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function railwayPublicBaseUrl(env: EnvMap): string | undefined {
  const domain = env.RAILWAY_PUBLIC_DOMAIN ?? env.RAILWAY_STATIC_URL;
  if (!domain) return undefined;
  return domain.startsWith("http://") || domain.startsWith("https://") ? domain : `https://${domain}`;
}
