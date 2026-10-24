type Block = { type?: string; props?: { level?: number; language?: string }; content?: unknown; children?: Block[] };
type Material = { heading: string | null; blockIndex: number; text: string };
const numberedHeading = /^\s*(?:\d+(?:\.\d+)*[.、．)）]|[一二三四五六七八九十]+[、.．)）])\s*/u;

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (!value || typeof value !== "object") return "";
  const item = value as { text?: unknown; content?: unknown; rows?: Array<{ cells?: unknown[] }> };
  if (Array.isArray(item.rows)) return item.rows.map((row) => (row.cells ?? []).map(textOf).join(" | ")).join("\n");
  return `${typeof item.text === "string" ? item.text : ""}${textOf(item.content)}`;
}

// Interview answers need the whole section, including lists, tables and code.
// Retrieval snippets intentionally remain separate in learning-store.ts.
export function interviewMaterials(content: string, plainText: string): Material[] {
  let blocks: Block[];
  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    blocks = parsed;
  } catch { return plainText.trim().length >= 16 ? splitMaterial(null, 0, plainText.trim()) : []; }
  const flat: Array<{ block: Block; index: number; text: string }> = [];
  const visit = (items: Block[]) => {
    for (const block of items) {
      flat.push({ block, index: flat.length, text: textOf(block.content).trim() });
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(blocks);
  const levels = flat.filter((item) => item.block.type === "heading" && item.text).map((item) => item.block.props?.level ?? 2);
  let boundary = levels.length ? Math.min(...levels) : 2;
  // A single document-level h1 should not swallow all of its h2 chapters.
  if (boundary === 1 && levels.filter((level) => level === 1).length === 1 && levels.some((level) => level > 1)) boundary = Math.min(...levels.filter((level) => level > 1));
  const result: Material[] = [];
  let heading: string | null = null;
  let parts: string[] = [];
  let bodyLength = 0;
  let firstBody = 0;
  const flush = () => {
    if (bodyLength >= 16) result.push(...splitMaterial(heading, firstBody, parts.join("\n\n")));
    parts = []; bodyLength = 0;
  };
  for (const { block, index, text } of flat) {
    if (!text) continue;
    if (block.type === "heading") {
      // Imported notes can mix heading levels for numbered sibling topics.
      if ((block.props?.level ?? 2) <= boundary || numberedHeading.test(text)) { flush(); heading = text; }
      else parts.push(text);
      continue;
    }
    if (!bodyLength) firstBody = index;
    bodyLength += text.replace(/\s/g, "").length;
    parts.push(block.type === "codeBlock" ? `\`\`\`${block.props?.language ?? ""}\n${text}\n\`\`\`` : text);
  }
  flush();
  return result;
}

function splitMaterial(heading: string | null, blockIndex: number, text: string): Material[] {
  const parts: Material[] = [];
  let remaining = text.trim();
  while (remaining.length > 5000) {
    const prefix = remaining.slice(0, 5000);
    const end = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("。") + 1);
    let cut = end >= 2500 ? end : 5000;
    if (remaining.length - cut < 16) cut = remaining.length - 16;
    parts.push({ heading, blockIndex, text: remaining.slice(0, cut).trim() });
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length >= 16) parts.push({ heading, blockIndex, text: remaining });
  else if (remaining && parts.length && parts[parts.length - 1].text.length + remaining.length + 1 <= 5000) parts[parts.length - 1].text += `\n${remaining}`;
  return parts;
}

export function interviewPrompt(heading: string | null, keywords: string[]): string {
  const topic = (heading || keywords.slice(0, 2).join("和")).replace(numberedHeading, "").trim();
  if (/[?？]$/.test(topic)) return topic;
  if (/^(为什么|为何|如何|怎么|什么是|哪些|怎样)/.test(topic)) return `${topic}？`;
  if (/(?:和|与|vs\.?|VS\.?).+/.test(topic)) return `${topic}有什么区别和联系？`;
  if (/(?:架构|原理|机制|流程)$/.test(topic)) return `${topic}是怎样的？`;
  return `请介绍一下${topic}。`;
}
