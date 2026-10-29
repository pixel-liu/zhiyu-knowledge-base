export type DocumentSummary = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  tags: string[];
  sortOrder: number;
  isPinned: boolean;
  isLocked: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  snippet?: string;
};

export type DocumentRecord = DocumentSummary & { content: string; plainText: string };
export type DocumentPatch = Partial<Pick<DocumentRecord, "title" | "icon" | "tags" | "content" | "parentId" | "isPinned">>;

export function documentSummary(document: DocumentRecord | DocumentSummary): DocumentSummary {
  const { id, parentId, title, icon, tags, sortOrder, isPinned, isLocked, isDeleted, createdAt, updatedAt, deletedAt, snippet } = document;
  return { id, parentId, title, icon, tags, sortOrder, isPinned, isLocked, isDeleted, createdAt, updatedAt, deletedAt, ...(snippet === undefined ? {} : { snippet }) };
}
