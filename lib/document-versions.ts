import type { DatabaseSync } from "node:sqlite";

export type DocumentVersion = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  plainText: string;
  createdAt: string;
};

type VersionRow = {
  id: string;
  document_id: string;
  title: string;
  content: string;
  plain_text: string;
  created_at: string;
};

const toVersion = (row: VersionRow): DocumentVersion => ({
  id: row.id,
  documentId: row.document_id,
  title: row.title,
  content: row.content,
  plainText: row.plain_text,
  createdAt: row.created_at,
});

export function initializeDocumentVersions(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      plain_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_document_versions_document_time
      ON document_versions(document_id, created_at DESC);
  `);
  const missing = db.prepare(`SELECT d.id AS documentId, d.title, d.content, d.plain_text AS plainText, d.updated_at AS createdAt
    FROM documents d WHERE NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.document_id = d.id)`).all() as unknown as Array<Pick<DocumentVersion, "documentId" | "title" | "content" | "plainText" | "createdAt">>;
  for (const row of missing) recordDocumentVersion(db, row);
}

export function recordDocumentVersion(db: DatabaseSync, document: Pick<DocumentVersion, "documentId" | "title" | "content" | "plainText" | "createdAt">, forceBoundary = false) {
  const latest = db.prepare("SELECT * FROM document_versions WHERE document_id = ? ORDER BY created_at DESC LIMIT 1").get(document.documentId) as VersionRow | undefined;
  if (latest && latest.title === document.title && latest.content === document.content) return toVersion(latest);
  const withinMergeWindow = !forceBoundary && latest && new Date(document.createdAt).getTime() - new Date(latest.created_at).getTime() < 5 * 60 * 1000;
  if (withinMergeWindow) {
    db.prepare("UPDATE document_versions SET title = ?, content = ?, plain_text = ?, created_at = ? WHERE id = ?")
      .run(document.title, document.content, document.plainText, document.createdAt, latest.id);
    return { ...document, id: latest.id };
  }
  const version = { ...document, id: crypto.randomUUID() };
  db.prepare("INSERT INTO document_versions (id, document_id, title, content, plain_text, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(version.id, version.documentId, version.title, version.content, version.plainText, version.createdAt);
  db.prepare(`DELETE FROM document_versions WHERE id IN (
    SELECT id FROM document_versions WHERE document_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 60
  )`).run(document.documentId);
  return version;
}

export function listDocumentVersions(db: DatabaseSync, documentId: string) {
  const rows = db.prepare(`SELECT id, document_id, title, content, plain_text, created_at
    FROM document_versions WHERE document_id = ? ORDER BY created_at DESC`).all(documentId) as unknown as VersionRow[];
  return rows.map(toVersion);
}

export function getDocumentVersion(db: DatabaseSync, documentId: string, versionId: string) {
  const row = db.prepare("SELECT * FROM document_versions WHERE document_id = ? AND id = ?").get(documentId, versionId) as VersionRow | undefined;
  return row ? toVersion(row) : null;
}
