export type LinkReference = { key: string; title: string; targetId: string | null };
type Target = { id: string; title: string };

export const documentHref = (id: string) => `/?document=${encodeURIComponent(id)}`;
export function linkedDocumentId(href: string) {
  // Only our root-relative links belong to the document library.
  if (!href.startsWith("/?")) return null;
  try { return new URLSearchParams(href.slice(2)).get("document") || null; } catch { return null; }
}

function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(inlineText).join("");
  if (value && typeof value === "object") {
    const item = value as { text?: unknown; content?: unknown };
    return (typeof item.text === "string" ? item.text : "") + inlineText(item.content);
  }
  return "";
}

export function extractDocumentLinks(content: string): LinkReference[] {
  const references = new Map<string, LinkReference>();
  const scan = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      if (value.length && value.every((piece) => typeof piece === "string" || piece && typeof piece === "object" && ["text", "link"].includes(piece.type))) scan({ type: "paragraph", content: value });
      else value.forEach(scan);
      return;
    }
    const item = value as { type?: string; href?: string; content?: unknown; children?: unknown; rows?: unknown; cells?: unknown };
    if (item.type === "codeBlock" || item.type === "code") return;
    if (item.type === "link") {
      const id = typeof item.href === "string" ? linkedDocumentId(item.href) : null;
      if (id) references.set(`id:${id}`, { key: `id:${id}`, targetId: id, title: inlineText(item.content).replace(/^\[\[|\]\]$/g, "") });
      return; // External link captions are not wiki references.
    }
    if (item.type && ["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "quote", "toggleListItem", "toggleHeading"].includes(item.type) || item.type === "tableCell") {
      // Join adjacent styled runs while keeping existing hyperlinks separate.
      const pieces = Array.isArray(item.content) ? item.content : [item.content];
      let text = "";
      const collect = () => {
        for (const match of text.matchAll(/(?<!\\)\[\[([^\[\]\r\n]{1,200})\]\]/g)) {
          const title = match[1].trim();
          if (title) references.set(`title:${title}`, { key: `title:${title}`, targetId: null, title });
        }
        text = "";
      };
      for (const piece of pieces) {
        if (piece && typeof piece === "object" && (piece as { type?: string }).type === "link") { collect(); scan(piece); }
        else if (!(piece && typeof piece === "object" && (piece as { styles?: { code?: boolean } }).styles?.code)) text += inlineText(piece);
        else collect();
      }
      collect();
    } else scan(item.content);
    scan(item.children); scan(item.rows); scan(item.cells);
  };
  try { scan(JSON.parse(content)); } catch {
    // Plain imported text: fenced code is not a reference.
    scan([{ type: "paragraph", content: content.replace(/```[\s\S]*?(?:```|$)/g, "") }]);
  }
  return [...references.values()];
}

// Preserve text length and styles when turning a completed [[title]] into an ID link.
export function linkifyInlineContent(content: unknown, targets: readonly Target[], bindings: readonly LinkReference[] = []): unknown {
  if (typeof content === "string") content = [{ type: "text", text: content, styles: {} }];
  if (!Array.isArray(content)) return content;
  const result: unknown[] = [];
  let runs: Array<{ type: string; text: string; styles: Record<string, unknown> }> = [];
  const flush = () => {
    const text = runs.map((run) => run.text).join("");
    const slice = (start: number, end: number) => {
      let offset = 0;
      return runs.flatMap((run) => {
        const from = Math.max(0, start - offset), to = Math.min(run.text.length, end - offset);
        offset += run.text.length;
        return to > from ? [{ ...run, text: run.text.slice(from, to) }] : [];
      });
    };
    let cursor = 0;
    for (const match of text.matchAll(/(?<!\\)\[\[([^\[\]\r\n]{1,200})\]\]/g)) {
      const title = match[1].trim();
      const bound = bindings.find((item) => item.key === `title:${title}`)?.targetId;
      const candidates = targets.filter((item) => item.title === title);
      const id = bound ?? (candidates.length === 1 ? candidates[0].id : null);
      if (!id || !targets.some((target) => target.id === id)) continue;
      const start = match.index!;
      result.push(...slice(cursor, start), { type: "link", href: documentHref(id), content: slice(start, start + match[0].length) });
      cursor = start + match[0].length;
    }
    result.push(...slice(cursor, text.length));
    runs = [];
  };
  for (const piece of content) {
    if (piece && typeof piece === "object" && piece.type === "text" && typeof piece.text === "string" && !piece.styles?.code) runs.push(piece);
    else { flush(); result.push(piece); }
  }
  flush();
  return result;
}

export function remapDocumentLinks(content: string, ids: Map<string, string>) {
  try {
    const parsed = JSON.parse(content);
    const walk = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!value || typeof value !== "object") return;
      const item = value as Record<string, unknown>;
      if (item.type === "link" && typeof item.href === "string") {
        const id = linkedDocumentId(item.href);
        if (id && ids.has(id)) item.href = documentHref(ids.get(id)!);
      }
      Object.values(item).forEach(walk);
    };
    walk(parsed);
    return JSON.stringify(parsed);
  } catch { return content; }
}
