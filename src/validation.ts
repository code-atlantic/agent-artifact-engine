import { isValidSlug } from "./slug.js";
import { MAX_ARTIFACT_CATEGORIES, MAX_ARTIFACT_TAGS, normalizeTaxonomyLabels } from "./taxonomy.js";
import type {
  ArtifactSourceFormat,
  ArtifactVisibility,
  CreateArtifactInput,
  CreateShareInput,
  CreateVersionInput
} from "./types.js";

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export function validateCreateArtifact(body: unknown, maxSourceBytes: number): ValidationResult<CreateArtifactInput> {
  if (!isRecord(body)) return invalid("Expected a JSON object.");

  const title = cleanString(body.title);
  const sourceFormat = parseSourceFormat(body.format) ?? (typeof body.mdx === "string" ? "mdx" : "html");
  const source = cleanString(sourceFormat === "mdx" ? body.mdx ?? body.content : body.html ?? body.content);
  const description = cleanString(body.description);
  const visibility = parseVisibility(body.visibility);
  const slug = cleanString(body.slug);
  const ownerId = cleanString(body.ownerId);
  const tags = normalizeTaxonomyLabels(readStringList(body.tags));
  const categories = normalizeTaxonomyLabels([...readStringList(body.categories), ...readStringList(body.category)]);

  if (!title) return invalid("title is required.");
  if (title.length > 140) return invalid("title must be 140 characters or fewer.");
  if (body.format !== undefined && !parseSourceFormat(body.format)) return invalid("format must be html or mdx.");
  if (!source) return invalid(`${sourceFormat === "mdx" ? "mdx" : "html"} is required.`);
  if (Buffer.byteLength(source, "utf8") > maxSourceBytes) return invalid(`content exceeds ${maxSourceBytes} bytes.`);
  if (description && description.length > 500) return invalid("description must be 500 characters or fewer.");
  if (body.visibility !== undefined && !visibility) return invalid("visibility must be private, unlisted, or public.");
  if (slug && !isValidSlug(slug)) return invalid("slug must use lowercase letters, numbers, and hyphens.");
  if (body.metadata !== undefined && !isPlainObject(body.metadata)) return invalid("metadata must be a JSON object.");
  if (tags.length > MAX_ARTIFACT_TAGS) return invalid(`tags must contain ${MAX_ARTIFACT_TAGS} or fewer unique labels.`);
  if (categories.length > MAX_ARTIFACT_CATEGORIES) return invalid("categories must contain one or fewer unique labels.");

  return {
    ok: true,
    value: {
      title,
      source,
      sourceFormat,
      description,
      visibility: visibility ?? "unlisted",
      slug,
      ownerId,
      metadata: isPlainObject(body.metadata) ? body.metadata : {},
      tags,
      categories
    }
  };
}

export function validateCreateVersion(body: unknown, maxSourceBytes: number): ValidationResult<CreateVersionInput> {
  if (!isRecord(body)) return invalid("Expected a JSON object.");

  const sourceFormat = parseSourceFormat(body.format) ?? (typeof body.mdx === "string" ? "mdx" : "html");
  const source = cleanString(sourceFormat === "mdx" ? body.mdx ?? body.content : body.html ?? body.content);

  if (body.format !== undefined && !parseSourceFormat(body.format)) return invalid("format must be html or mdx.");
  if (!source) return invalid(`${sourceFormat === "mdx" ? "mdx" : "html"} is required.`);
  if (Buffer.byteLength(source, "utf8") > maxSourceBytes) return invalid(`content exceeds ${maxSourceBytes} bytes.`);

  return { ok: true, value: { source, sourceFormat, createdBy: "agent" } };
}

export function validateCreateShare(body: unknown): ValidationResult<CreateShareInput> {
  if (body === undefined || body === null) return { ok: true, value: {} };
  if (!isRecord(body)) return invalid("Expected a JSON object.");

  const permission = parsePermission(body.permission);
  const expiresAt = cleanString(body.expiresAt);

  if (body.permission !== undefined && !permission) return invalid("permission must be view, comment, or fork.");
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) return invalid("expiresAt must be an ISO date string.");

  return { ok: true, value: { permission: permission ?? "view", expiresAt } };
}

function parseVisibility(value: unknown): ArtifactVisibility | undefined {
  if (value === "private" || value === "unlisted" || value === "public") return value;
  return undefined;
}

function parseSourceFormat(value: unknown): ArtifactSourceFormat | undefined {
  if (value === "html" || value === "mdx") return value;
  return undefined;
}

function parsePermission(value: unknown): CreateShareInput["permission"] | undefined {
  if (value === "view" || value === "comment" || value === "fork") return value;
  return undefined;
}

function invalid(message: string): ValidationResult<never> {
  return { ok: false, message };
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function readStringList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
