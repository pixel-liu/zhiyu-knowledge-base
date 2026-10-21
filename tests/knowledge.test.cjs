const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const load = require("./load-typescript.cjs");
const { NextRequest } = require("next/server");
const links = load("lib/document-links.ts");
const schedule = load("lib/knowledge-types.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const paragraph = (text) => JSON.stringify([{ type: "paragraph", content: [{ type: "text", text, styles: {} }] }]);

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyu-knowledge-"));
  const databases = [];
  let clock = Date.parse("2026-10-21T02:00:00Z");
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  class TestDatabase extends DatabaseSync { constructor(...args) { super(...args); databases.push(this); } }
  let documents;
  const knowledge = load("lib/knowledge-store.ts", {
    Date: Clock, process: { ...process, env: { ...process.env, ZHIYU_DATA_DIR: directory } },
    require: (name, fallback) => {
      if (name === "node:sqlite") return { DatabaseSync: TestDatabase };
      const value = fallback(name);
      if (name === "./documents-db") documents = value;
      return value;
    },
  });
  t.after(() => {
    databases.forEach((db) => db.close());
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "zhiyu-knowledge-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { documents, knowledge, databases, advance: (ms) => { clock += ms; } };
}

test("wiki references cover styled runs, nested blocks and tables, while ignoring code and external links", () => {
  const content = JSON.stringify([
    { type: "paragraph", content: [{ type: "text", text: "[[Red", styles: {} }, { type: "text", text: "is]]", styles: { bold: true } },
      { type: "text", text: " [[code]]", styles: { code: true } }, { type: "link", href: "/?document=stable-id", content: [{ type: "text", text: "[[链接]]", styles: {} }] },
      { type: "link", href: "https://other.example", content: [{ type: "text", text: "[[external]]", styles: {} }] }], children: [{ type: "paragraph", content: "[[嵌套]]" }] },
    { type: "codeBlock", content: "[[not-a-reference]]" },
    { type: "table", content: { type: "tableContent", rows: [{ cells: [[{ type: "text", text: "[[表格]]", styles: {} }], { type: "tableCell", content: [{ type: "text", text: "[[单元格]]", styles: {} }] }] }] } },
    { type: "paragraph", content: "\\[[escaped]] [[Redis]]" },
  ]);
  const references = plain(links.extractDocumentLinks(content));
  assert.deepEqual(references.map((item) => item.key).sort(), ["title:Redis", "id:stable-id", "title:嵌套", "title:表格", "title:单元格"].sort());
  assert.equal(links.linkedDocumentId("https://other.example/?document=secret"), null);
  const converted = plain(links.linkifyInlineContent([
    { type: "text", text: "看 [[Red", styles: {} }, { type: "text", text: "is]]。", styles: { bold: true } },
  ], [{ id: "redis-id", title: "Redis" }]));
  const link = converted.find((item) => item.type === "link");
  assert.equal(link.href, "/?document=redis-id");
  assert.equal(link.content.map((run) => run.text).join(""), "[[Redis]]");
  assert.equal(link.content[1].styles.bold, true);
  const ambiguous = links.linkifyInlineContent([{ type: "text", text: "[[重复]]", styles: {} }], [{ id: "1", title: "重复" }, { id: "2", title: "重复" }]);
  assert.ok(!ambiguous.some((item) => item.type === "link"));
});

test("bidirectional links survive renames, distinguish duplicate titles and honor trash, restore and purge", (t) => {
  const { documents: db, knowledge } = fixture(t);
  const target = db.createDocument({ title: "Redis" });
  const source = db.createDocument({ title: "缓存策略", content: paragraph("相关知识 [[Redis]] 和 [[稍后创建]]") });
  assert.equal(knowledge.getConnections(source.id).outgoing.find((item) => item.title === "Redis").target.id, target.id);
  assert.equal(knowledge.getConnections(target.id).backlinks[0].id, source.id);
  db.updateDocument(target.id, { title: "Redis 新标题" });
  db.updateDocument(source.id, { content: paragraph("更新说明，相关知识 [[Redis]] 和 [[稍后创建]]") });
  assert.equal(knowledge.getConnections(source.id).outgoing.find((item) => item.title === "Redis").target.title, "Redis 新标题");
  const later = db.createDocument({ title: "稍后创建" });
  assert.equal(knowledge.getConnections(later.id).backlinks[0].id, source.id);
  db.softDeleteDocument(source.id);
  assert.equal(knowledge.getConnections(target.id).backlinks.length, 0);
  db.restoreDocument(source.id);
  assert.equal(knowledge.getConnections(target.id).backlinks.length, 1);
  db.softDeleteDocument(target.id);
  assert.equal(knowledge.getConnections(source.id).outgoing.find((item) => item.title === "Redis").target, null);
  db.restoreDocument(target.id);
  assert.equal(knowledge.getConnections(source.id).outgoing.find((item) => item.title === "Redis").target.id, target.id);
  const duplicateA = db.createDocument({ title: "重复" });
  db.createDocument({ title: "重复" });
  const duplicateSource = db.createDocument({ title: "同名引用", content: paragraph("[[重复]]") });
  const ambiguous = knowledge.getConnections(duplicateSource.id).outgoing[0];
  assert.equal(ambiguous.target, null); assert.equal(ambiguous.candidates.length, 2);
  db.updateDocument(duplicateSource.id, { content: JSON.stringify([{ type: "paragraph", content: [{ type: "link", href: links.documentHref(duplicateA.id), content: "[[重复]]" }] }]) });
  assert.equal(knowledge.getConnections(duplicateSource.id).outgoing[0].target.id, duplicateA.id);
  db.permanentlyDeleteDocument(source.id);
  assert.equal(knowledge.getConnections(target.id).backlinks.length, 0);
});

test("review schedules persist, stale submissions cannot grade twice and deleted notes leave the queue", (t) => {
  const { documents: db, knowledge, advance } = fixture(t);
  const document = db.createDocument({ title: "事务隔离" });
  assert.equal(knowledge.getReview(document.id), null);
  const plan = knowledge.setStudyStatus(document.id, "learning");
  assert.equal(plan.status, "learning"); assert.equal(knowledge.getReviewOverview().due, 1);
  const result = knowledge.gradeReview(document.id, "good", plan.version);
  assert.equal(result.reviewCount, 1); assert.equal(result.dueAt, "2026-10-22T02:00:00.000Z");
  assert.equal(knowledge.getReviewOverview().due, 0); assert.equal(knowledge.getReviewOverview().reviewedToday, 1);
  assert.throws(() => knowledge.gradeReview(document.id, "good", plan.version), { status: 409 });
  assert.equal(knowledge.getReview(document.id).reviewCount, 1);
  advance(86400000 + 1);
  assert.equal(knowledge.getReviewOverview().due, 1); assert.equal(knowledge.getReviewOverview().reviewedToday, 0);
  const again = knowledge.gradeReview(document.id, "again", result.version);
  assert.equal(again.stage, 0); assert.equal(again.status, "learning");
  assert.equal(knowledge.getReviewOverview().due, 0);
  advance(10 * 60 * 1000);
  assert.equal(knowledge.getReviewOverview().due, 1);
  db.softDeleteDocument(document.id); assert.equal(knowledge.getReviewOverview().total, 0);
  assert.throws(() => knowledge.gradeReview(document.id, "good", again.version), { status: 404 });
  db.restoreDocument(document.id); assert.equal(knowledge.getReviewOverview().total, 1);
  knowledge.setStudyStatus(document.id, "mastered"); assert.equal(knowledge.getReview(document.id).status, "mastered");
  knowledge.setStudyStatus(document.id, "off"); assert.equal(knowledge.getReviewOverview().total, 0);
  knowledge.setStudyStatus(document.id, "learning"); db.permanentlyDeleteDocument(document.id);
  assert.equal(knowledge.getReviewOverview().total, 0);
});

test("backup import remaps internal links and retains review plans alongside original documents", async (t) => {
  const { documents: db, knowledge } = fixture(t);
  const parent = db.createDocument({ title: "父目录" });
  const target = db.createDocument({ title: "关联目标", parentId: parent.id });
  const source = db.createDocument({ title: "关联来源", parentId: target.id, content: JSON.stringify([{ type: "paragraph", content: [{ type: "link", href: links.documentHref(target.id), content: "[[关联目标]]" }] }]) });
  const legacy = db.createDocument({ title: "旧语法来源", content: paragraph("[[关联目标]]") });
  db.updateDocument(target.id, { title: "关联目标已改名" });
  const plan = knowledge.setStudyStatus(target.id, "mastered");
  const backup = plain(db.exportBackup());
  backup.documents.reverse(); // A backup's row order must not affect nested restoration.
  db.importBackup(backup);
  const importedSource = db.listDocuments().find((document) => document.title === source.title && document.id !== source.id);
  const importedTarget = db.listDocuments().find((document) => document.title === "关联目标已改名" && document.id !== target.id);
  const importedLegacy = db.listDocuments().find((document) => document.title === legacy.title && document.id !== legacy.id);
  assert.equal(knowledge.getConnections(importedSource.id).outgoing[0].target.id, importedTarget.id);
  assert.equal(importedSource.parentId, importedTarget.id);
  assert.equal(knowledge.getConnections(importedLegacy.id).outgoing[0].target.id, importedTarget.id);
  assert.equal(knowledge.getReview(importedTarget.id).dueAt, plan.dueAt);
  assert.equal(knowledge.getReview(importedTarget.id).status, "mastered");
  assert.equal(knowledge.getConnections(source.id).outgoing[0].target.id, target.id);
  const { POST } = load("app/api/backup/route.ts", { require: (name, fallback) => name === "@/lib/documents-db" ? db : fallback(name) });
  const response = await POST(new NextRequest("http://localhost/api/backup", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(db.exportBackup()) }));
  assert.equal(response.status, 200, "the API accepts the complete JSON it exports, including exportedAt");
});

test("review intervals grow and remain bounded; forgotten answers return in ten minutes", () => {
  const now = Date.parse("2026-10-21T02:00:00Z");
  assert.equal(schedule.nextReview(0, "easy", now).dueAt, "2026-10-28T02:00:00.000Z");
  assert.equal(schedule.nextReview(7, "good", now).stage, 7);
  assert.equal(schedule.nextReview(7, "again", now).dueAt, "2026-10-21T02:10:00.000Z");
  assert.equal(schedule.nextReview(0, "hard", now).dueAt, "2026-10-22T02:00:00.000Z");
});
