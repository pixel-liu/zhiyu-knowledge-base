import { existsSync, readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DocumentRecord = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  tags: string[];
  content: string;
  plainText: string;
  sortOrder: number;
  isPinned: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  snippet?: string;
};

type DocumentRow = {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  tags: string | null;
  content: string;
  plain_text: string;
  sort_order: number;
  is_pinned: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const dataDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(dataDirectory, "knowledge.db");
const legacyNotesPath = path.join(dataDirectory, "notes.json");

let database: DatabaseSync | null = null;

const now = () => new Date().toISOString();

const parseTags = (value: string | null | undefined) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 30)
      : [];
  } catch { return []; }
};

const toRecord = (row: DocumentRow): DocumentRecord => ({
  id: row.id,
  parentId: row.parent_id,
  title: row.title,
  icon: row.icon,
  tags: parseTags(row.tags),
  content: row.content,
  plainText: row.plain_text,
  sortOrder: row.sort_order,
  isPinned: Boolean(row.is_pinned),
  isDeleted: Boolean(row.is_deleted),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

const emptyContent = () => JSON.stringify([
  { type: "paragraph", content: [] },
]);

function textToBlocks(value: string) {
  const blocks = value
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => ({
      type: "paragraph",
      content: paragraph.split("\n").flatMap((line, index) => [
        ...(index ? [{ type: "text", text: "\n", styles: {} }] : []),
        { type: "text", text: line, styles: {} },
      ]),
    }));
  return JSON.stringify(blocks.length ? blocks : JSON.parse(emptyContent()));
}

function contentToText(content: string) {
  try {
    const blocks = JSON.parse(content) as Array<{ content?: unknown }>;
    const extract = (value: unknown): string => {
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.map(extract).join(" ");
      if (value && typeof value === "object") {
        const item = value as { text?: unknown; content?: unknown };
        return `${typeof item.text === "string" ? item.text : ""} ${extract(item.content)}`;
      }
      return "";
    };
    return blocks.map((block) => extract(block.content)).join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return content.replace(/\s+/g, " ").trim();
  }
}

function getDatabase() {
  if (database) return database;

  mkdirSync(dataDirectory, { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      icon TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      content TEXT NOT NULL,
      plain_text TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      document_id UNINDEXED,
      title,
      plain_text
    );
    CREATE INDEX IF NOT EXISTS idx_documents_parent_order
      ON documents(parent_id, sort_order)
      WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_documents_deleted_at
      ON documents(is_deleted, deleted_at);
  `);

  const columns = db.prepare("PRAGMA table_info(documents)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "is_pinned")) {
    db.exec("ALTER TABLE documents ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((column) => column.name === "tags")) {
    db.exec("ALTER TABLE documents ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
  }

  const count = db.prepare("SELECT COUNT(*) AS count FROM documents").get() as { count: number };
  if (!count.count) migrateLegacyNotes(db);
  database = db;
  return db;
}

function migrateLegacyNotes(db: DatabaseSync) {
  const createdAt = now();
  let legacyNotes: Array<{ id?: string; title?: string; content?: string; updatedAt?: string }> = [];
  if (existsSync(legacyNotesPath)) {
    try {
      legacyNotes = JSON.parse(readFileSync(legacyNotesPath, "utf8"));
    } catch {
      legacyNotes = [];
    }
  }

  const notes = legacyNotes.length ? legacyNotes : [
    {
      id: "welcome",
      title: "欢迎来到我的文档库",
      content: "从左侧创建文档或子文档。\n\n正文会自动保存到本机数据库。",
    },
  ];

  const insert = db.prepare(`
    INSERT INTO documents (id, parent_id, title, icon, tags, content, plain_text, sort_order, is_deleted, created_at, updated_at)
    VALUES (?, NULL, ?, '📄', '[]', ?, ?, ?, 0, ?, ?)
  `);
  const insertSearch = db.prepare(
    "INSERT INTO documents_fts (document_id, title, plain_text) VALUES (?, ?, ?)"
  );

  notes.forEach((note, index) => {
    const id = note.id || `document-${Date.now()}-${index}`;
    const content = textToBlocks(note.content || "");
    const plainText = contentToText(content);
    const title = note.title || "未命名文档";
    insert.run(id, title, content, plainText, index, createdAt, createdAt);
    insertSearch.run(id, title, plainText);
  });
}

function refreshSearchIndex(db: DatabaseSync, document: DocumentRecord) {
  db.prepare("DELETE FROM documents_fts WHERE document_id = ?").run(document.id);
  if (!document.isDeleted) {
    db.prepare("INSERT INTO documents_fts (document_id, title, plain_text) VALUES (?, ?, ?)")
      .run(document.id, document.title, document.plainText);
  }
}

export function listDocuments(includeDeleted = false) {
  const db = getDatabase();
  const sql = includeDeleted
    ? "SELECT * FROM documents ORDER BY is_deleted ASC, parent_id, is_pinned DESC, sort_order, created_at"
    : "SELECT * FROM documents WHERE is_deleted = 0 ORDER BY parent_id, is_pinned DESC, sort_order, created_at";
  return (db.prepare(sql).all() as unknown as DocumentRow[]).map(toRecord);
}

export function getDocument(id: string) {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;
  return row ? toRecord(row) : null;
}

export function createDocument(input: { parentId?: string | null; title?: string; content?: string }) {
  const db = getDatabase();
  const parentId = input.parentId ?? null;
  if (parentId) {
    const parent = getDocument(parentId);
    if (!parent || parent.isDeleted) throw new Error("父文档不存在");
  }
  const siblingCount = db.prepare(
    "SELECT COUNT(*) AS count FROM documents WHERE parent_id IS ? AND is_deleted = 0"
  ).get(parentId) as { count: number };
  const timestamp = now();
  const document: DocumentRecord = {
    id: crypto.randomUUID(),
    parentId,
    title: input.title?.trim() || "未命名文档",
    icon: "📄",
    tags: [],
    content: input.content ?? emptyContent(),
    plainText: contentToText(input.content ?? ""),
    sortOrder: siblingCount.count,
    isPinned: false,
    isDeleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
  db.prepare(`
    INSERT INTO documents (id, parent_id, title, icon, tags, content, plain_text, sort_order, is_pinned, is_deleted, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, NULL)
  `).run(
    document.id, document.parentId, document.title, document.icon, JSON.stringify(document.tags), document.content,
    document.plainText, document.sortOrder, document.createdAt, document.updatedAt
  );
  refreshSearchIndex(db, document);
  return document;
}

export function updateDocument(id: string, patch: Partial<Pick<DocumentRecord, "title" | "icon" | "content" | "parentId" | "isPinned" | "tags">>) {
  const db = getDatabase();
  const existing = getDocument(id);
  if (!existing || existing.isDeleted) return null;
  const nextParentId = patch.parentId === undefined ? existing.parentId : patch.parentId;
  if (nextParentId === id) throw new Error("不能将文档设为自己的父级");
  if (nextParentId) {
    const parent = getDocument(nextParentId);
    if (!parent || parent.isDeleted) throw new Error("目标父文档不存在");
    if (descendantIds(db, id).includes(nextParentId)) throw new Error("不能移动到自己的子文档中");
  }
  const document: DocumentRecord = {
    ...existing,
    title: patch.title === undefined ? existing.title : patch.title.trim() || "未命名文档",
    icon: patch.icon === undefined ? existing.icon : patch.icon,
    tags: patch.tags === undefined ? existing.tags : parseTags(JSON.stringify(patch.tags)),
    content: patch.content === undefined ? existing.content : patch.content,
    parentId: nextParentId,
    isPinned: patch.isPinned === undefined ? existing.isPinned : Boolean(patch.isPinned),
    updatedAt: now(),
  };
  document.plainText = contentToText(document.content);
  db.prepare(`
    UPDATE documents
    SET parent_id = ?, title = ?, icon = ?, tags = ?, content = ?, plain_text = ?, is_pinned = ?, updated_at = ?
    WHERE id = ?
  `).run(document.parentId, document.title, document.icon, JSON.stringify(document.tags), document.content, document.plainText, document.isPinned ? 1 : 0, document.updatedAt, document.id);
  refreshSearchIndex(db, document);
  return document;
}

function descendantIds(db: DatabaseSync, id: string) {
  const rows = db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM documents WHERE id = ?
      UNION ALL
      SELECT documents.id FROM documents JOIN descendants ON documents.parent_id = descendants.id
    )
    SELECT id FROM descendants
  `).all(id) as unknown as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export function softDeleteDocument(id: string) {
  const db = getDatabase();
  const existing = getDocument(id);
  if (!existing || existing.isDeleted) return false;
  const ids = descendantIds(db, id);
  const deletedAt = now();
  const update = db.prepare("UPDATE documents SET is_deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?");
  db.exec("BEGIN");
  try {
    for (const documentId of ids) {
      update.run(deletedAt, deletedAt, documentId);
      db.prepare("DELETE FROM documents_fts WHERE document_id = ?").run(documentId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return true;
}

export function restoreDocument(id: string) {
  const db = getDatabase();
  const existing = getDocument(id);
  if (!existing || !existing.isDeleted) return null;
  const ids = descendantIds(db, id);
  const restoreIds = new Set(ids);
  let parentId = existing.parentId;
  while (parentId) {
    const parent = getDocument(parentId);
    if (!parent || !parent.isDeleted) break;
    restoreIds.add(parent.id);
    parentId = parent.parentId;
  }
  const restoredAt = now();
  const update = db.prepare("UPDATE documents SET is_deleted = 0, deleted_at = NULL, updated_at = ? WHERE id = ?");
  db.exec("BEGIN");
  try {
    for (const documentId of restoreIds) update.run(restoredAt, documentId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const restored = getDocument(id);
  for (const documentId of restoreIds) {
    const document = getDocument(documentId);
    if (document) refreshSearchIndex(db, document);
  }
  return restored;
}

export function permanentlyDeleteDocument(id: string) {
  const db = getDatabase();
  const existing = getDocument(id);
  if (!existing) return false;
  const ids = descendantIds(db, id);
  db.exec("BEGIN");
  try {
    for (const documentId of ids) {
      db.prepare("DELETE FROM documents_fts WHERE document_id = ?").run(documentId);
      db.prepare("DELETE FROM documents WHERE id = ?").run(documentId);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return true;
}

export function reorderDocuments(parentId: string | null, documentIds: string[]) {
  const db = getDatabase();
  const siblings = db.prepare(
    "SELECT id FROM documents WHERE parent_id IS ? AND is_deleted = 0 ORDER BY sort_order, created_at"
  ).all(parentId) as unknown as Array<{ id: string }>;
  if (new Set(documentIds).size !== documentIds.length || siblings.length !== documentIds.length || siblings.some((row) => !documentIds.includes(row.id))) {
    throw new Error("排序请求不完整");
  }
  const update = db.prepare("UPDATE documents SET sort_order = ?, updated_at = ? WHERE id = ?");
  const timestamp = now();
  db.exec("BEGIN");
  try {
    documentIds.forEach((id, index) => update.run(index, timestamp, id));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function makeSnippet(value: string, query: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "空文档";
  const needle = query.trim().split(/\s+/).find(Boolean) || "";
  const position = needle ? text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()) : -1;
  const start = Math.max(0, position > 0 ? position - 34 : 0);
  const snippet = text.slice(start, start + 110);
  return `${start > 0 ? "…" : ""}${snippet}${start + 110 < text.length ? "…" : ""}`;
}

export function searchDocuments(query: string, tag = "") {
  const db = getDatabase();
  const terms = query.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const conditions = ["d.is_deleted = 0"];
  const params: Array<string | number> = [];
  if (query) {
    const like = `%${query}%`;
    const matchQuery = terms.map((term) => `"${term.replace(/"/g, "")}"*`).join(" AND ");
    conditions.push(terms.length
      ? "(d.title LIKE ? OR d.plain_text LIKE ? OR d.id IN (SELECT document_id FROM documents_fts WHERE documents_fts MATCH ?))"
      : "(d.title LIKE ? OR d.plain_text LIKE ?)");
    params.push(like, like);
    if (terms.length) params.push(matchQuery);
  }
  if (tag) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(d.tags) WHERE json_each.value = ?)");
    params.push(tag);
  }
  const rows = db.prepare(`
    SELECT d.* FROM documents d
    WHERE ${conditions.join(" AND ")}
    ORDER BY d.updated_at DESC
    LIMIT 30
  `).all(...params) as unknown as DocumentRow[];
  return rows.map(toRecord).map((document) => ({ ...document, snippet: makeSnippet(document.plainText, query) }));
}

export function exportBackup(documentId?: string) {
  const db = getDatabase();
  const rows = (documentId
    ? db.prepare("SELECT * FROM documents WHERE id = ?").all(documentId)
    : db.prepare("SELECT * FROM documents ORDER BY parent_id, sort_order, created_at").all()) as unknown as DocumentRow[];
  const documents = rows.map(toRecord);
  const settings = Object.fromEntries((db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>).map((item) => [item.key, item.value]));
  return { format: "zhiyu-backup", version: 1, exportedAt: now(), documents, settings };
}

type MarkdownBlock = {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: MarkdownBlock[];
};

function blockContentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(blockContentText).join("");
  if (value && typeof value === "object") {
    const item = value as { text?: unknown; content?: unknown };
    return `${typeof item.text === "string" ? item.text : ""}${blockContentText(item.content)}`;
  }
  return "";
}

function contentToMarkdown(content: string, fallback: string) {
  try {
    const blocks = JSON.parse(content) as MarkdownBlock[];
    const renderBlock = (block: MarkdownBlock, depth = 0): string => {
      const text = blockContentText(block.content).trimEnd();
      const indent = "  ".repeat(depth);
      let line = text;
      if (block.type === "heading") {
        const level = Math.min(6, Math.max(1, Number(block.props?.level) || 1));
        line = `${"#".repeat(level)} ${text}`;
      } else if (block.type === "bulletListItem") {
        line = `${indent}- ${text}`;
      } else if (block.type === "numberedListItem") {
        line = `${indent}1. ${text}`;
      } else if (block.type === "checkListItem") {
        line = `${indent}- [${block.props?.checked ? "x" : " "}] ${text}`;
      } else if (block.type === "codeBlock") {
        line = `\`\`\`${String(block.props?.language || "")}\n${text}\n\`\`\``;
      } else if (block.type === "image") {
        const url = typeof block.props?.url === "string" ? block.props.url : "";
        const caption = typeof block.props?.caption === "string" ? block.props.caption : "";
        line = url ? `![${caption}](${url})` : "";
      }
      const children = (block.children || []).map((child) => renderBlock(child, depth + 1)).filter(Boolean);
      return [line, ...children].filter(Boolean).join("\n\n");
    };
    return blocks.map((block) => renderBlock(block)).filter(Boolean).join("\n\n") || fallback;
  } catch {
    return fallback;
  }
}

export function exportMarkdown(documentId?: string) {
  const documents = documentId
    ? listDocuments(false).filter((document) => document.id === documentId)
    : listDocuments(false);
  return documents
    .map((document) => `# ${document.title}\n\n${contentToMarkdown(document.content, document.plainText || "")}\n`)
    .join("\n---\n\n");
}
type BackupInput = {
  documents: Array<Pick<DocumentRecord, "id" | "parentId" | "title" | "icon" | "tags" | "content" | "plainText" | "sortOrder" | "isPinned" | "isDeleted" | "createdAt" | "updatedAt" | "deletedAt">>;
  settings?: Record<string, string>;
};

export function importBackup(input: BackupInput) {
  const db = getDatabase();
  const existing = new Set((db.prepare("SELECT id FROM documents").all() as Array<{ id: string }>).map((row) => row.id));
  const ids = new Map(input.documents.map((document) => [document.id, existing.has(document.id) ? crypto.randomUUID() : document.id]));
  const insert = db.prepare(`
    INSERT INTO documents (id, parent_id, title, icon, tags, content, plain_text, sort_order, is_pinned, is_deleted, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec("BEGIN");
  try {
    for (const source of input.documents) {
      const content = source.content || emptyContent();
      insert.run(ids.get(source.id)!, source.parentId ? ids.get(source.parentId) ?? null : null, source.title || "未命名文档", source.icon || "📄", JSON.stringify(parseTags(JSON.stringify(source.tags))), content, source.plainText || contentToText(content), Number(source.sortOrder) || 0, source.isPinned ? 1 : 0, source.isDeleted ? 1 : 0, source.createdAt || now(), source.updatedAt || now(), source.deletedAt || null);
    }
    if (input.settings) {
      const setting = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
      Object.entries(input.settings).forEach(([key, value]) => setting.run(key, String(value), now()));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  for (const source of input.documents) {
    const imported = getDocument(ids.get(source.id)!);
    if (imported) refreshSearchIndex(db, imported);
  }
  return input.documents.length;
}

export function getSetting(key: string) {
  const db = getDatabase();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now());
}
