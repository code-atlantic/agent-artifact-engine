const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "artifact";
}

export function isValidSlug(value: string): boolean {
  return slugPattern.test(value);
}

export function withNumericSuffix(slug: string, index: number): string {
  return `${slug}-${String(index).padStart(2, "0")}`;
}
