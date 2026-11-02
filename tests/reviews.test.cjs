const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { DatabaseSync } = require("node:sqlite");
const { NextRequest } = require("next/server");
const load = require("./load-typescript.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zhiyu-reviews-"));
  const databases = [];
  class TestDatabase extends DatabaseSync { constructor(...args) { super(...args); databases.push(this); } }
  let documents;
  const knowledge = load("lib/knowledge-store.ts", {
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
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "zhiyu-reviews-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { documents, knowledge };
}

test("single and bulk removal preserve notes, future plans and completed history; re-enrollment rejects stale scores", (t) => {
  const { documents, knowledge } = fixture(t);
  const first = documents.createDocument({ title: "到期一" });
  const second = documents.createDocument({ title: "到期二" });
  const future = documents.createDocument({ title: "未来计划" });
  const oldPlan = knowledge.setStudyStatus(first.id, "learning");
  const scored = knowledge.gradeReview(first.id, "good", oldPlan.version);
  knowledge.setStudyStatus(second.id, "learning");
  knowledge.setStudyStatus(future.id, "mastered");
  assert.equal(knowledge.removeReviewPlans([first.id]).length, 1);
  assert.equal(knowledge.getReview(first.id), null);
  assert.equal(documents.getDocument(first.id).title, first.title);
  assert.equal(knowledge.getReviewOverview().reviewedToday, 1);
  const fresh = knowledge.setStudyStatus(first.id, "learning");
  assert.equal(fresh.reviewCount, 0);
  assert.equal(fresh.lastReviewedAt, null);
  assert.equal(fresh.stage, 0);
  assert.notEqual(fresh.version, oldPlan.version);
  assert.throws(() => knowledge.gradeReview(first.id, "good", oldPlan.version), { status: 409 });
  assert.throws(() => knowledge.gradeReview(first.id, "good", scored.version), { status: 409 });
  const dueIds = knowledge.getReviewOverview().items.filter((item) => item.review.status === "learning").map((item) => item.id);
  assert.equal(knowledge.removeReviewPlans([...dueIds, ...dueIds, "missing"]).length, 2);
  assert.equal(knowledge.getReviewOverview().total, 1);
  assert.equal(knowledge.getReview(future.id).status, "mastered");
  knowledge.removeReviewPlans(knowledge.getReviewOverview().items.map((item) => item.id));
  assert.equal(knowledge.getReviewOverview().total, 0);
  for (const id of [first.id, second.id, future.id]) knowledge.setStudyStatus(id, "learning");
  assert.equal(knowledge.getReviewOverview().total, 3);
  knowledge.setStudyStatus(first.id, "off");
  assert.equal(knowledge.getReview(first.id), null);
  assert.equal(knowledge.setStudyStatus(first.id, "learning").reviewCount, 0);
});

test("review endpoints validate deletion, return updated counts and persist re-enrollment", async (t) => {
  const { documents, knowledge } = fixture(t);
  const route = load("app/api/reviews/route.ts", { require: (name, fallback) => name === "@/lib/knowledge-store" ? knowledge : fallback(name) });
  const single = load("app/api/documents/[id]/review/route.ts", { require: (name, fallback) => name === "@/lib/knowledge-store" ? knowledge : fallback(name) });
  const doc = documents.createDocument({ title: "接口复习" });
  const params = { params: Promise.resolve({ id: doc.id }) };
  const request = (body) => new NextRequest("http://localhost/api/reviews", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  for (const body of [null, {}, { documentIds: [] }, { documentIds: [1] }, { documentIds: [" "] }, { documentIds: [doc.id], all: true }]) {
    assert.equal((await route.DELETE(request(body))).status, 400);
  }
  assert.equal(await (await single.GET(request(null), params)).json(), null);
  knowledge.setStudyStatus(doc.id, "learning");
  const removed = await (await route.DELETE(request({ documentIds: [doc.id] }))).json();
  assert.deepEqual(removed.deletedIds, [doc.id]);
  assert.equal(removed.overview.total, 0);
  assert.equal(removed.overview.due, 0);
  assert.equal(await (await single.GET(request(null), params)).json(), null);
  assert.equal((await route.DELETE(request({ documentIds: [doc.id] }))).status, 200);
  const response = await single.POST(new NextRequest("http://localhost/api/documents/id/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "learning" }) }), params);
  assert.equal(response.status, 200);
  const plan = await response.json();
  assert.deepEqual(await (await single.GET(request(null), params)).json(), plan);
  assert.equal((await route.GET().json()).due, 1);
  assert.equal((await single.GET(request(null), { params: Promise.resolve({ id: "missing" }) })).status, 404);
});
