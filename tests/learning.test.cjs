const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const load = require("./load-typescript.cjs");

const content = (...blocks) => JSON.stringify(blocks);
const heading = (text) => ({ type: "heading", props: { level: 2 }, content: [{ type: "text", text, styles: {} }] });
const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text, styles: {} }] });

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyu-learning-"));
  const databases = [];
  let clock = Date.parse("2026-01-01T02:00:00Z");
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  class TestDatabase extends DatabaseSync { constructor(...args) { super(...args); databases.push(this); } }
  let documents;
  const learning = load("lib/learning-store.ts", {
    Date: Clock,
    process: { ...process, env: { ...process.env, ZHIYU_DATA_DIR: directory } },
    require: (name, fallback) => {
      if (name === "node:sqlite") return { DatabaseSync: TestDatabase };
      const value = fallback(name);
      if (name === "./documents-db") documents = value;
      return value;
    },
  });
  t.after(() => {
    databases.forEach((db) => db.close());
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "zhiyu-learning-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { documents, learning, advance: (milliseconds) => { clock += milliseconds; } };
}

test("knowledge answers cite matching note blocks and interviews identify omissions", (t) => {
  const { documents, learning } = fixture(t);
  const upload = documents.createDocument({ title: "附件上传设计", content: content(
    heading("异步上传流程"),
    paragraph("附件先写入临时存储，再进入消息队列异步处理。任务完成后更新文件状态，并通过幂等键避免重复写入。"),
    heading("失败处理"),
    paragraph("失败任务采用指数退避重试，超过阈值后写入死信队列并提醒人工处理。"),
  ) });
  documents.createDocument({ title: "数据库索引", content: content(paragraph("联合索引遵循最左前缀原则。")) });

  const answer = learning.answerFromNotes("附件异步上传怎么避免重复写入");
  assert.equal(answer.citations[0].documentId, upload.id);
  assert.match(answer.answer, /幂等键/);
  assert.equal(answer.citations[0].blockIndex, 1);
  assert.ok(answer.citations.every((item) => item.excerpt !== "异步上传流程" && item.excerpt !== "失败处理"));

  const questions = learning.buildInterview([upload.id]);
  assert.ok(questions.length >= 2);
  assert.equal(questions[0].documentId, upload.id);
  assert.equal(questions[0].referenceAnswer, questions[0].source, "local questions include a prepared reference answer");
  assert.equal(questions[0].explanation, "", "does not invent an explanation beyond the document");
  const weak = learning.evaluateInterview(questions[0], "先上传，然后后台处理");
  assert.ok(weak.omissions.length > 0);
  assert.ok(weak.followUp);
  const strong = learning.evaluateInterview(questions[0], questions[0].keywords.join("，"));
  assert.equal(strong.coverage, 100);
});

test("knowledge health reports duplicate titles, unresolved concepts and stale drafts", (t) => {
  const { documents, learning, advance } = fixture(t);
  const repeated = "缓存数据需要设置过期时间，并在数据库更新后主动删除旧缓存，避免用户持续读取已经过期的数据。";
  documents.createDocument({ title: "Redis", content: content(paragraph(repeated)) });
  documents.createDocument({ title: "Redis", content: content(paragraph(repeated)) });
  const source = documents.createDocument({ title: "系统设计", content: content(paragraph("依赖 [[Redis]] 和 [[熔断机制]]。")) });
  const draft = documents.createDocument({ title: "未命名文档", content: content(paragraph("待整理")) });
  advance(31 * 86400000);

  const health = learning.inspectKnowledgeHealth();
  assert.ok(health.issues.some((item) => item.kind === "duplicate-title"));
  assert.ok(health.issues.some((item) => item.kind === "duplicate-content"));
  assert.ok(health.issues.some((item) => item.kind === "ambiguous-link" && item.documentId === source.id));
  assert.ok(health.issues.some((item) => item.kind === "unexplained" && /熔断机制/.test(item.detail)));
  assert.ok(health.issues.some((item) => item.kind === "stale-draft" && item.documentId === draft.id));
});

test("document versions merge active edits, retain older states and travel with backups", (t) => {
  const { documents, learning, advance } = fixture(t);
  const document = documents.createDocument({ title: "版本测试", content: content(paragraph("第一版")) });
  documents.updateDocument(document.id, { content: content(paragraph("连续输入后的第一版")) });
  assert.equal(learning.versionSummaries(document.id).length, 1, "edits inside five minutes merge into one version");
  advance(6 * 60 * 1000);
  documents.updateDocument(document.id, { title: "版本测试二", content: content(paragraph("第二版内容")) });
  const versions = learning.versionSummaries(document.id);
  assert.equal(versions.length, 2);
  assert.match(learning.readVersion(document.id, versions[1].id).plainText, /连续输入后的第一版/);
  const old = learning.readVersion(document.id, versions[1].id);
  documents.updateDocument(document.id, { title: old.title, content: old.content }, { forceVersion: true });
  assert.equal(learning.versionSummaries(document.id).length, 3, "restoring always creates a reversible version boundary");

  const backup = documents.exportBackup(document.id);
  assert.equal(backup.version, 3);
  assert.equal(backup.versions.length, 3);
  documents.importBackup(backup);
  const imported = documents.listDocuments().find((item) => item.title === "版本测试" && item.id !== document.id);
  assert.ok(imported);
  assert.equal(learning.versionSummaries(imported.id).length, 3);
});
