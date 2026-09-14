import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";
export const alt = "My Study Notes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface OgImageProps {
  params: Promise<{ slug: string }>;
}

// Branded Open Graph card generated with Satori (via next/og's ImageResponse).
const OgImage = async ({ params }: OgImageProps) => {
  const { slug } = await params;
  const doc = await fetchQuery(api.documents.getBySlug, { slug });
  const title = doc?.title || "Study Notes";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fafaf9",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: "34px",
            fontWeight: 600,
            color: "#78716c",
            letterSpacing: "-0.5px",
          }}
        >
          My Study Notes
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 40 ? "64px" : "80px",
            fontWeight: 800,
            color: "#1c1917",
            lineHeight: 1.1,
            letterSpacing: "-2px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            height: "14px",
            width: "180px",
            background: "#1c1917",
            borderRadius: "8px",
          }}
        />
      </div>
    ),
    { ...size }
  );
};

export default OgImage;
