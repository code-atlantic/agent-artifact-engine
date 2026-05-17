import type { AppConfig } from "../core/config.js";
import type { Artifact, ArtifactShare, ArtifactVersion } from "../core/types.js";

export interface ArtifactUrls {
  viewUrl: string;
  rawUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
}

export function artifactUrls(config: AppConfig, artifact: Artifact, version: ArtifactVersion): ArtifactUrls {
  return {
    viewUrl: absoluteUrl(config.publicBaseUrl, `/a/${artifact.slug}`),
    rawUrl: absoluteUrl(config.artifactBaseUrl, `/raw/${version.id}`),
    embedUrl: absoluteUrl(config.publicBaseUrl, `/embed/${artifact.id}`),
    thumbnailUrl: absoluteUrl(config.publicBaseUrl, `/thumb/${version.id}`)
  };
}

export function shareUrl(config: AppConfig, share: ArtifactShare): string {
  return absoluteUrl(config.publicBaseUrl, `/s/${share.token}`);
}

export function absoluteUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
