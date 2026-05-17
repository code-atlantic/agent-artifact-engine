import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { renderArtifactSource } from "../render/source.js";
import { sha256 } from "../utils/hash.js";
import { slugify, withNumericSuffix } from "../utils/slug.js";
import type {
  Artifact,
  ArtifactRecord,
  ArtifactShare,
  ArtifactVersion,
  ArtifactVisibility,
  ArtifactWithVersion,
  CreateArtifactInput,
  CreateShareInput,
  CreateVersionInput
} from "../core/types.js";

interface StoreIndex {
  artifacts: Artifact[];
  versions: ArtifactVersion[];
  shares: ArtifactShare[];
}

interface ArtifactFilters {
  tag?: string;
  category?: string;
  visibility?: ArtifactVisibility;
}

const emptyIndex = (): StoreIndex => ({
  artifacts: [],
  versions: [],
  shares: []
});

export class FileArtifactStore {
  private readonly indexPath: string;
  private readonly blobsDir: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string) {
    this.indexPath = join(dataDir, "index.json");
    this.blobsDir = join(dataDir, "blobs");
  }

  async createArtifact(input: CreateArtifactInput): Promise<ArtifactRecord> {
    return this.mutate(async (index) => {
      const now = new Date().toISOString();
      const artifactId = randomUUID();
      const versionId = randomUUID();
      const html = await renderArtifactSource(input.source, input.sourceFormat, input.title);
      const storageKey = `${artifactId}/${versionId}.html`;
      const sourceStorageKey = input.sourceFormat === "mdx" ? `${artifactId}/${versionId}.mdx` : undefined;
      const slug = this.nextSlug(index, input.slug ?? input.title);

      const version: ArtifactVersion = {
        id: versionId,
        artifactId,
        storageKey,
        sourceStorageKey,
        sourceFormat: input.sourceFormat,
        checksum: sha256(html),
        bytes: Buffer.byteLength(html, "utf8"),
        sourceBytes: Buffer.byteLength(input.source, "utf8"),
        createdAt: now,
        createdBy: "agent"
      };

      const artifact: Artifact = {
        id: artifactId,
        slug,
        title: input.title.trim(),
        description: cleanOptionalString(input.description),
        visibility: input.visibility ?? "unlisted",
        currentVersionId: version.id,
        ownerId: input.ownerId?.trim() || "anonymous",
        metadata: input.metadata ?? {},
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        createdAt: now,
        updatedAt: now
      };

      await this.writeHtml(storageKey, html);
      if (sourceStorageKey) await this.writeHtml(sourceStorageKey, input.source);
      index.artifacts.push(artifact);
      index.versions.push(version);

      return { artifact, currentVersion: version };
    });
  }

  async createVersion(artifactId: string, input: CreateVersionInput): Promise<ArtifactRecord | undefined> {
    return this.mutate(async (index) => {
      const artifact = index.artifacts.find((item) => item.id === artifactId);
      if (!artifact) return undefined;

      const now = new Date().toISOString();
      const html = await renderArtifactSource(input.source, input.sourceFormat, artifact.title);
      const versionId = randomUUID();
      const version: ArtifactVersion = {
        id: versionId,
        artifactId,
        storageKey: `${artifactId}/${versionId}.html`,
        sourceStorageKey: input.sourceFormat === "mdx" ? `${artifactId}/${versionId}.mdx` : undefined,
        sourceFormat: input.sourceFormat,
        checksum: sha256(html),
        bytes: Buffer.byteLength(html, "utf8"),
        sourceBytes: Buffer.byteLength(input.source, "utf8"),
        createdAt: now,
        createdBy: input.createdBy ?? "agent"
      };

      await this.writeHtml(version.storageKey, html);
      if (version.sourceStorageKey) await this.writeHtml(version.sourceStorageKey, input.source);
      artifact.currentVersionId = version.id;
      artifact.updatedAt = now;
      index.versions.push(version);

      return { artifact: normalizeArtifact(artifact), currentVersion: version };
    });
  }

  async createShare(artifactId: string, input: CreateShareInput = {}): Promise<ArtifactShare | undefined> {
    return this.mutate(async (index) => {
      const artifact = index.artifacts.find((item) => item.id === artifactId);
      if (!artifact) return undefined;

      const share: ArtifactShare = {
        id: randomUUID(),
        artifactId,
        token: randomToken(),
        permission: input.permission ?? "view",
        expiresAt: cleanOptionalString(input.expiresAt),
        createdAt: new Date().toISOString()
      };

      index.shares.push(share);
      return share;
    });
  }

  async listVisible(limit = 20, filters: ArtifactFilters = {}): Promise<ArtifactRecord[]> {
    return this.listArtifacts(limit, { ...filters, visibility: "public" });
  }

  async listArtifacts(limit = 20, filters: ArtifactFilters = {}): Promise<ArtifactRecord[]> {
    const index = await this.readIndex();
    return index.artifacts
      .filter((artifact) => !filters.visibility || artifact.visibility === filters.visibility)
      .filter((artifact) => !filters.tag || (artifact.tags ?? []).includes(filters.tag))
      .filter((artifact) => !filters.category || (artifact.categories ?? []).includes(filters.category))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
      .map((artifact) => this.recordFromIndex(index, artifact))
      .filter((record): record is ArtifactRecord => Boolean(record));
  }

  async listTaxonomy(kind: "tag" | "category"): Promise<Array<{ value: string; count: number }>> {
    const index = await this.readIndex();
    const counts = new Map<string, number>();

    for (const artifact of index.artifacts) {
      if (artifact.visibility !== "public") continue;
      const values = kind === "tag" ? artifact.tags ?? [] : artifact.categories ?? [];
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  }

  async getById(id: string): Promise<ArtifactRecord | undefined> {
    const index = await this.readIndex();
    const artifact = index.artifacts.find((item) => item.id === id);
    return artifact ? this.recordFromIndex(index, artifact) : undefined;
  }

  async getBySlug(slug: string): Promise<ArtifactRecord | undefined> {
    const index = await this.readIndex();
    const artifact = index.artifacts.find((item) => item.slug === slug);
    return artifact ? this.recordFromIndex(index, artifact) : undefined;
  }

  async getByVersionId(versionId: string): Promise<ArtifactWithVersion | undefined> {
    const index = await this.readIndex();
    const version = index.versions.find((item) => item.id === versionId);
    if (!version) return undefined;

    const artifact = index.artifacts.find((item) => item.id === version.artifactId);
    return artifact ? { artifact: normalizeArtifact(artifact), version } : undefined;
  }

  async listVersions(artifactId: string): Promise<ArtifactVersion[]> {
    const index = await this.readIndex();
    return index.versions
      .filter((version) => version.artifactId === artifactId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getShareByToken(token: string): Promise<(ArtifactShare & { artifact: Artifact; version: ArtifactVersion }) | undefined> {
    const index = await this.readIndex();
    const share = index.shares.find((item) => item.token === token);
    if (!share || isExpired(share)) return undefined;

    const artifact = index.artifacts.find((item) => item.id === share.artifactId);
    if (!artifact) return undefined;

    const version = index.versions.find((item) => item.id === artifact.currentVersionId);
    return version ? { ...share, artifact: normalizeArtifact(artifact), version } : undefined;
  }

  async isValidShareForArtifact(token: string, artifactId: string): Promise<boolean> {
    const share = await this.getShareByToken(token);
    return share?.artifactId === artifactId;
  }

  async readVersionHtml(version: ArtifactVersion): Promise<string> {
    return readFile(join(this.blobsDir, version.storageKey), "utf8");
  }

  async readThumbnail(version: ArtifactVersion): Promise<Buffer | undefined> {
    if (!version.thumbnailStorageKey) return undefined;
    return readFile(join(this.blobsDir, version.thumbnailStorageKey));
  }

  private recordFromIndex(index: StoreIndex, artifact: Artifact): ArtifactRecord | undefined {
    const currentVersion = index.versions.find((item) => item.id === artifact.currentVersionId);
    return currentVersion ? { artifact: normalizeArtifact(artifact), currentVersion } : undefined;
  }

  private nextSlug(index: StoreIndex, value: string): string {
    const existing = new Set(index.artifacts.map((artifact) => artifact.slug));
    const baseSlug = slugify(value);
    let slug = baseSlug;
    let suffix = 1;

    while (existing.has(slug)) {
      slug = withNumericSuffix(baseSlug, suffix);
      suffix += 1;
    }

    return slug;
  }

  private async mutate<T>(operation: (index: StoreIndex) => Promise<T>): Promise<T> {
    let resolveWrite: () => void;
    const previousWrite = this.writeQueue;
    this.writeQueue = new Promise((resolve) => {
      resolveWrite = resolve;
    });

    await previousWrite;

    try {
      await this.ensureReady();
      const index = await this.readIndex();
      const result = await operation(index);
      await this.writeIndex(index);
      return result;
    } finally {
      resolveWrite!();
    }
  }

  private async ensureReady(): Promise<void> {
    await mkdir(this.blobsDir, { recursive: true });
  }

  private async readIndex(): Promise<StoreIndex> {
    try {
      const raw = await readFile(this.indexPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreIndex>;
      return {
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
        versions: Array.isArray(parsed.versions) ? parsed.versions : [],
        shares: Array.isArray(parsed.shares) ? parsed.shares : []
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return emptyIndex();
      throw error;
    }
  }

  private async writeIndex(index: StoreIndex): Promise<void> {
    await mkdir(dirname(this.indexPath), { recursive: true });
    const tempPath = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await rename(tempPath, this.indexPath);
  }

  private async writeHtml(storageKey: string, html: string): Promise<void> {
    const fullPath = join(this.blobsDir, storageKey);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, html, "utf8");
  }
}

function normalizeArtifact(artifact: Artifact): Artifact {
  return {
    ...artifact,
    tags: artifact.tags ?? [],
    categories: artifact.categories ?? []
  };
}

function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

function cleanOptionalString(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean ? clean : undefined;
}

function isExpired(share: ArtifactShare): boolean {
  return Boolean(share.expiresAt && Date.parse(share.expiresAt) <= Date.now());
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
