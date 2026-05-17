import type { AppConfig } from "../core/config.js";

export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function appCsp(config: AppConfig, nonce: string): string {
  const artifactOrigin = new URL(config.artifactBaseUrl).origin;
  const publicOrigin = new URL(config.publicBaseUrl).origin;
  const frameSources = artifactOrigin === publicOrigin ? "'self'" : `'self' ${artifactOrigin}`;

  return [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src 'self' data: https:",
    `frame-src ${frameSources}`,
    "form-action 'self'"
  ].join("; ");
}

export function rawArtifactCsp(config: AppConfig): string {
  const publicOrigin = new URL(config.publicBaseUrl).origin;
  const scriptSrc = config.artifactAllowScripts ? "'unsafe-inline' blob:" : "'none'";

  return [
    "default-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'unsafe-inline' https:",
    "img-src https: data: blob:",
    "font-src https: data:",
    "media-src https: data: blob:",
    "frame-src https:",
    "connect-src 'none'",
    `frame-ancestors ${publicOrigin}`
  ].join("; ");
}

export function artifactSandbox(config: AppConfig): string {
  if (!config.artifactAllowScripts) return "";
  return "allow-scripts allow-forms allow-popups allow-downloads";
}
