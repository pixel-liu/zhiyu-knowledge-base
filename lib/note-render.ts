import "server-only";

import { ServerBlockNoteEditor } from "@blocknote/server-util";
import type { PartialBlock } from "@blocknote/core";
import { fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const parseBlocks = (content?: string): PartialBlock[] | null => {
  if (!content) return null;
  try {
    const blocks = JSON.parse(content);
    return Array.isArray(blocks) && blocks.length ? (blocks as PartialBlock[]) : null;
  } catch {
    return null;
  }
};

// The custom "pageLink" block isn't known to the default server schema, so we
// replace each one with a standard link/text block before rendering. Linked
// notes that are themselves published become real <a> links to /notes/[slug]
// (good internal linking); unpublished ones render as plain bold text.
/* eslint-disable @typescript-eslint/no-explicit-any */
const transformBlock = async (block: any): Promise<any> => {
  if (block?.type === "pageLink") {
    const id = block?.props?.documentId as string | undefined;
    let label = "Untitled";
    let href: string | null = null;

    if (id) {
      const doc = await fetchQuery(api.documents.getById, {
        documentId: id as Id<"documents">,
      }).catch(() => null);
      if (doc) {
        label = `${doc.icon ? `${doc.icon} ` : ""}${doc.title}`;
        href = doc.slug ? `/notes/${doc.slug}` : null;
      }
    }

    if (href) {
      return {
        type: "paragraph",
        content: [
          { type: "link", href, content: [{ type: "text", text: label, styles: {} }] },
        ],
      };
    }
    return {
      type: "paragraph",
      content: [{ type: "text", text: label, styles: { bold: true } }],
    };
  }

  if (Array.isArray(block?.children) && block.children.length) {
    return { ...block, children: await Promise.all(block.children.map(transformBlock)) };
  }
  return block;
};

const prepareBlocks = async (content?: string): Promise<PartialBlock[] | null> => {
  const blocks = parseBlocks(content);
  if (!blocks) return null;
  return (await Promise.all(blocks.map(transformBlock))) as PartialBlock[];
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Render a note's stored BlockNote JSON into semantic HTML on the server. */
export const renderNoteHtml = async (content?: string): Promise<string> => {
  const blocks = await prepareBlocks(content);
  if (!blocks) return "";
  const editor = ServerBlockNoteEditor.create();
  return editor.blocksToHTMLLossy(blocks);
};

/** A plaintext excerpt (for meta description / OG) derived from the note body. */
export const noteExcerpt = async (
  content?: string,
  max = 160
): Promise<string> => {
  const blocks = await prepareBlocks(content);
  if (!blocks) return "";
  const editor = ServerBlockNoteEditor.create();
  const md = await editor.blocksToMarkdownLossy(blocks);
  const text = md
    .replace(/```[\s\S]*?```/g, " ") // strip code fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // strip images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> their text
    .replace(/[#>*_`~]/g, " ") // markdown symbols
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
};
