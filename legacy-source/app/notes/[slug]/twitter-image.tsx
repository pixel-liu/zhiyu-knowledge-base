// Reuse the same Satori-generated card for Twitter/X cards.
// Segment config (runtime) and metadata-image fields must be literals here;
// only the generator function is re-exported.
export { default } from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "My Study Notes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
