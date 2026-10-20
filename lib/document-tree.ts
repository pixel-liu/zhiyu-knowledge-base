import type { DocumentSummary } from "./document-types";

export function indexDocumentTree(documents: DocumentSummary[]) {
  const children = new Map<string | null, DocumentSummary[]>();
  for (const document of documents) {
    const siblings = children.get(document.parentId) ?? [];
    siblings.push(document);
    children.set(document.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.sortOrder - b.sortOrder);
  return children;
}

export function documentParentOptions(documents: DocumentSummary[], children: ReturnType<typeof indexDocumentTree>) {
  const result: Array<{ document: DocumentSummary; depth: number }> = [];
  const visited = new Set<string>();
  const append = (parentId: string | null, depth: number) => {
    for (const document of children.get(parentId) ?? []) {
      if (visited.has(document.id)) continue;
      visited.add(document.id);
      result.push({ document, depth });
      append(document.id, depth + 1);
    }
  };
  append(null, 0);
  for (const document of documents) if (!visited.has(document.id)) result.push({ document, depth: 0 });
  return result;
}
