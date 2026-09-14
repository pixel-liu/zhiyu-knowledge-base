/**
 * Turn arbitrary text into a URL-safe slug.
 * Shared by the client (default slug) and Convex (normalizing on save), so it is
 * kept dependency-free and pure.
 */
export const slugify = (input: string): string =>
  input
    .normalize("NFKD") // split accented chars into base + diacritic
    .replace(/[̀-ͯ]/g, "") // drop the diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → dash
    .replace(/^-+|-+$/g, ""); // trim leading/trailing dashes
