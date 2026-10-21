import { getDatabase, getDocument } from "./documents-db";
import { nextReview, statusForStage, type DocumentConnections, type LinkedDocument, type ReviewGrade, type ReviewOverview, type ReviewPlan, type StudyStatus } from "./knowledge-types";

type ReviewRow = { document_id: string; stage: number; due_at: string; last_reviewed_at: string | null; review_count: number; version: number };
const toReview = (row: ReviewRow): ReviewPlan => ({ documentId: row.document_id, stage: row.stage, status: statusForStage(row.stage), dueAt: row.due_at, lastReviewedAt: row.last_reviewed_at, reviewCount: row.review_count, version: row.version });
const linkedColumns = "id, title, icon, parent_id AS parentId";

export class KnowledgeError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function requireDocument(id: string) {
  const document = getDocument(id);
  if (!document || document.isDeleted) throw new KnowledgeError("文档不存在。", 404);
  return document;
}

export function getConnections(id: string): DocumentConnections {
  requireDocument(id);
  const db = getDatabase();
  const references = db.prepare("SELECT reference_key, target_id, target_title FROM document_links WHERE source_id = ? ORDER BY rowid").all(id) as Array<{ reference_key: string; target_id: string | null; target_title: string }>;
  const outgoing = references.map((row) => {
    const target = row.target_id ? db.prepare(`SELECT ${linkedColumns} FROM documents WHERE id = ? AND is_deleted = 0`).get(row.target_id) as LinkedDocument | undefined : undefined;
    const candidates = row.target_id ? [] : db.prepare(`SELECT ${linkedColumns} FROM documents WHERE title = ? AND is_deleted = 0 ORDER BY created_at`).all(row.target_title) as LinkedDocument[];
    return { key: row.reference_key, title: row.target_title, targetId: row.target_id, target: target ?? null, candidates };
  });
  const backlinks = db.prepare(`SELECT DISTINCT d.id, d.title, d.icon, d.parent_id AS parentId FROM documents d
    JOIN document_links l ON l.source_id = d.id WHERE l.target_id = ? AND d.is_deleted = 0 AND d.id != ? ORDER BY d.updated_at DESC`).all(id, id) as LinkedDocument[];
  return { outgoing, backlinks };
}

export function getReview(id: string) {
  requireDocument(id);
  const row = getDatabase().prepare("SELECT * FROM document_reviews WHERE document_id = ?").get(id) as ReviewRow | undefined;
  return row ? toReview(row) : null;
}

export function setStudyStatus(id: string, status: StudyStatus | "off") {
  requireDocument(id);
  const db = getDatabase();
  if (status === "off") { db.prepare("DELETE FROM document_reviews WHERE document_id = ?").run(id); return null; }
  const stage = status === "learning" ? 0 : status === "consolidating" ? 2 : 4;
  const dueAt = new Date(Date.now() + (stage === 0 ? 0 : stage === 2 ? 3 : 14) * 86400000).toISOString();
  db.prepare(`INSERT INTO document_reviews (document_id, stage, due_at) VALUES (?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET stage = excluded.stage, due_at = excluded.due_at, version = version + 1`).run(id, stage, dueAt);
  return getReview(id);
}

export function gradeReview(id: string, grade: ReviewGrade, version: number) {
  requireDocument(id);
  const db = getDatabase();
  const current = getReview(id);
  if (!current) throw new KnowledgeError("这篇文档尚未加入复习。", 404);
  const timestamp = new Date().toISOString();
  const next = nextReview(current.stage, grade);
  db.exec("BEGIN");
  try {
    const result = db.prepare(`UPDATE document_reviews SET stage = ?, due_at = ?, last_reviewed_at = ?, review_count = review_count + 1,
      version = version + 1 WHERE document_id = ? AND version = ?`).run(next.stage, next.dueAt, timestamp, id, version);
    if (!result.changes) throw new KnowledgeError("复习记录已更新，请刷新后重试。", 409);
    db.prepare("INSERT INTO review_history (document_id, grade, reviewed_at) VALUES (?, ?, ?)").run(id, grade, timestamp);
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return getReview(id)!;
}

export function getReviewOverview(): ReviewOverview {
  const db = getDatabase();
  const timestamp = new Date().toISOString();
  const rows = db.prepare(`SELECT d.id, d.title, d.icon, d.parent_id AS parentId, r.* FROM document_reviews r
    JOIN documents d ON d.id = r.document_id WHERE d.is_deleted = 0 ORDER BY r.due_at, d.title`).all() as Array<LinkedDocument & ReviewRow>;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const midnight = new Date(`${day}T00:00:00+08:00`).toISOString();
  const today = db.prepare(`SELECT COUNT(DISTINCT h.document_id) AS count FROM review_history h JOIN documents d ON d.id = h.document_id
    WHERE d.is_deleted = 0 AND h.reviewed_at >= ? AND h.reviewed_at <= ?`).get(midnight, timestamp) as { count: number };
  return { items: rows.map((row) => ({ id: row.id, title: row.title, icon: row.icon, parentId: row.parentId, review: toReview(row) })), total: rows.length,
    due: rows.filter((row) => row.due_at <= timestamp).length, reviewedToday: today.count };
}
