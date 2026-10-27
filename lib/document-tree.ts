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
  const appendDocument = (document: DocumentSummary, depth: number) => {
    if (visited.has(document.id)) return;
    visited.add(document.id);
    result.push({ document, depth });
    append(document.id, depth + 1);
  };
  const append = (parentId: string | null, depth: number) => {
    for (const document of children.get(parentId) ?? []) {
      appendDocument(document, depth);
    }
  };
  append(null, 0);
  for (const document of documents) appendDocument(document, 0);
  return result;
}

export function documentSubtreeIds(documentId: string, children: ReturnType<typeof indexDocumentTree>) {
  const result: string[] = [];
  const visited = new Set<string>();
  const append = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    result.push(id);
    for (const child of children.get(id) ?? []) append(child.id);
  };
  append(documentId);
  return result;
}

export function toggleDocumentSubtreeSelection(selectedIds: string[], subtreeIds: string[], limit: number) {
  const uniqueSubtreeIds = [...new Set(subtreeIds)];
  const selected = new Set(selectedIds);
  if (uniqueSubtreeIds.every((id) => selected.has(id))) {
    const subtree = new Set(uniqueSubtreeIds);
    return { selectedIds: selectedIds.filter((id) => !subtree.has(id)), limitExceeded: false };
  }
  for (const id of uniqueSubtreeIds) selected.add(id);
  if (selected.size > limit) return { selectedIds, limitExceeded: true };
  return { selectedIds: [...selected], limitExceeded: false };
}
