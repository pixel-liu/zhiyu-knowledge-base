import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // The opaque /documents/[id] editor URLs are client-rendered empty shells
      // and not in the sitemap; the canonical, indexable pages live at
      // /notes/[slug]. We don't disallow /documents because "/" redirects there.
      allow: "/",
      // The owner login page shouldn't be indexed.
      disallow: ["/admin"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
