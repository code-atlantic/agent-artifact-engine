import { slugify } from "./slug.js";

export const MAX_ARTIFACT_TAGS = 6;
export const MAX_ARTIFACT_CATEGORIES = 1;

export function normalizeTaxonomyLabels(values: string[]): string[] {
  return [...new Set(values.map(slugify).filter(Boolean))];
}

export function limitTaxonomyLabels(values: string[], max: number): string[] {
  return normalizeTaxonomyLabels(values).slice(0, max);
}
