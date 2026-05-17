export type ArtifactVisibility = "private" | "unlisted" | "public";
export type ArtifactSourceFormat = "html" | "mdx";

export interface Artifact {
  id: string;
  slug: string;
  title: string;
  description?: string;
  visibility: ArtifactVisibility;
  currentVersionId: string;
  ownerId: string;
  metadata: Record<string, unknown>;
  tags: string[];
  categories: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  storageKey: string;
  sourceStorageKey?: string;
  thumbnailStorageKey?: string;
  sourceFormat: ArtifactSourceFormat;
  checksum: string;
  bytes: number;
  sourceBytes: number;
  createdAt: string;
  createdBy: "agent" | "user" | "system";
}

export interface ArtifactShare {
  id: string;
  artifactId: string;
  token: string;
  permission: "view" | "comment" | "fork";
  expiresAt?: string;
  createdAt: string;
}

export interface ArtifactRecord {
  artifact: Artifact;
  currentVersion: ArtifactVersion;
}

export interface ArtifactWithVersion {
  artifact: Artifact;
  version: ArtifactVersion;
}

export interface Principal {
  id: string;
  displayName?: string;
  capabilities: string[];
}

export interface CreateArtifactInput {
  title: string;
  source: string;
  sourceFormat: ArtifactSourceFormat;
  description?: string;
  visibility?: ArtifactVisibility;
  slug?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  categories?: string[];
  ownerId?: string;
}

export interface CreateVersionInput {
  source: string;
  sourceFormat: ArtifactSourceFormat;
  createdBy?: "agent" | "user" | "system";
}

export interface CreateShareInput {
  permission?: "view" | "comment" | "fork";
  expiresAt?: string;
}
