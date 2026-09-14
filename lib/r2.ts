import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;

// Public base URL the bucket is served from (e.g. https://pub-xxxx.r2.dev).
// Trailing slash is normalized away so we can safely join keys.
export const R2_PUBLIC_URL = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(
  /\/$/,
  ""
);

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/** Build the public URL for an object key. */
export const publicUrl = (key: string) => `${R2_PUBLIC_URL}/${key}`;

/** Recover the object key from a public URL, or null if it isn't ours. */
export const keyFromUrl = (url: string): string | null => {
  const prefix = `${R2_PUBLIC_URL}/`;
  if (!url.startsWith(prefix)) return null;
  return decodeURIComponent(url.slice(prefix.length));
};
