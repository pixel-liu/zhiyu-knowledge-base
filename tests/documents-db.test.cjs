const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), sqlite = require("node:sqlite");
const load = require("./load-typescript.cjs");

test("document summaries, selective updates, search and atomic index updates", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyu-test-"));
  let failIndex = false;
  const databases = [];
  const statements = [];
  class TestDatabase extends sqlite.DatabaseSync {
    constructor(...args) { super(...args); databases.push(this); }
    prepare(sql) {
      statements.push(sql);
      if (failIndex && sql.startsWith("INSERT INTO documents_fts")) throw new Error("index unavailable");
      return super.prepare(sql);
    }
  }
  t.after(() => {
    databases.forEach((database) => database.close());
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "zhiyu-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const db = load("lib/documents-db.ts", {
    process: { ...process, env: { ...process.env, ZHIYU_DATA_DIR: directory } },
    require: (name) => name === "node:sqlite" ? { DatabaseSync: TestDatabase } : require(name),
  });
  const body = JSON.stringify([{ type: "paragraph", content: "这是可搜索的中文正文 architecture" }]);
  const a = db.createDocument({ title: "Parent", content: body });
  const b = db.createDocument({ title: "Child", parentId: a.id, content: body });
  const summaries = db.listDocumentSummaries();
  assert.ok(summaries.every((item) => !("content" in item) && !("plainText" in item)));
  assert.equal(db.getDocument(a.id).content, body);

  statements.length = 0;
  db.updateDocument(b.id, { isPinned: true, tags: ["test"] });
  assert.ok(!statements.some((sql) => sql.includes("WITH RECURSIVE") || sql.includes("DELETE FROM documents_fts")));
  const update = statements.find((sql) => sql.startsWith("UPDATE documents SET"));
  assert.ok(!update.includes("content ="));
  assert.equal(db.getDocument(b.id).content, body);
  assert.throws(() => db.updateDocument(a.id, { parentId: b.id }));

  const found = db.searchDocuments("中文正文");
  assert.ok(found.some((item) => item.id === a.id));
  assert.ok(found.every((item) => !("content" in item) && !("plainText" in item) && item.snippet.length <= 112));
  assert.ok(db.recentDocuments().every((item) => !("content" in item) && item.snippet.length <= 110));

  failIndex = true;
  assert.throws(() => db.updateDocument(a.id, { title: "must rollback" }));
  failIndex = false;
  assert.equal(db.getDocument(a.id).title, "Parent");
  assert.ok(db.searchDocuments("architecture").some((item) => item.id === a.id));

  db.updateDocument(b.id, { parentId: null });
  assert.equal(db.getDocument(b.id).parentId, null);
  assert.ok(db.getDocument(b.id).sortOrder > db.getDocument(a.id).sortOrder);
  db.softDeleteDocument(b.id);
  assert.ok(!db.listDocumentSummaries().some((item) => item.id === b.id));
  assert.ok(db.listDocumentSummaries(false, true).every((item) => item.isDeleted));
  db.restoreDocument(b.id);
  assert.ok(db.listDocumentSummaries().some((item) => item.id === b.id));
});
