import type { DatabaseSync } from "node:sqlite";
import { extractDocumentLinks } from "./document-links";

export function resolveUnboundLinks(db: DatabaseSync) {
  db.exec(`UPDATE document_links SET target_id = (
    SELECT MIN(id) FROM documents WHERE is_deleted = 0 AND title = document_links.target_title
  ) WHERE target_id IS NULL AND (
    SELECT COUNT(*) FROM documents WHERE is_deleted = 0 AND title = document_links.target_title
  ) = 1`);
}

export function syncDocumentLinks(db: DatabaseSync, id: string, content: string) {
  const previous = new Map((db.prepare("SELECT reference_key, target_id FROM document_links WHERE source_id = ?").all(id) as Array<{ reference_key: string; target_id: string | null }>).map((row) => [row.reference_key, row.target_id]));
  db.prepare("DELETE FROM document_links WHERE source_id = ?").run(id);
  const insert = db.prepare("INSERT INTO document_links (source_id, reference_key, target_id, target_title) VALUES (?, ?, ?, ?)");
  for (const reference of extractDocumentLinks(content)) insert.run(id, reference.key, reference.targetId ?? previous.get(reference.key) ?? null, reference.title);
}

export function initializeKnowledgeTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_links (
      source_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      reference_key TEXT NOT NULL, target_id TEXT, target_title TEXT NOT NULL,
      PRIMARY KEY (source_id, reference_key)
    );
    CREATE INDEX IF NOT EXISTS idx_document_links_target ON document_links(target_id);
    CREATE INDEX IF NOT EXISTS idx_document_titles ON documents(title) WHERE is_deleted = 0;
    CREATE TABLE IF NOT EXISTS document_reviews (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      stage INTEGER NOT NULL DEFAULT 0, due_at TEXT NOT NULL,
      last_reviewed_at TEXT, review_count INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_document_review_due ON document_reviews(due_at);
    CREATE TABLE IF NOT EXISTS review_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      grade TEXT NOT NULL, reviewed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_review_history_date ON review_history(reviewed_at);
  `);
  if (!db.prepare("SELECT value FROM settings WHERE key = 'document-links-version'").get()) {
    db.exec("BEGIN");
    try {
      for (const row of db.prepare("SELECT id, content FROM documents").all() as Array<{ id: string; content: string }>) syncDocumentLinks(db, row.id, row.content);
      resolveUnboundLinks(db);
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('document-links-version', '1', ?)").run(new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
}
