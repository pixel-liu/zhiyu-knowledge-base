const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");
const { DocumentSaveQueue } = load("lib/document-save-queue.ts", { Error });

function setup(t, request) {
  const drafts = new Map(), saved = [], errors = [];
  const queue = new DocumentSaveQueue({
    request, delay: 60_000,
    storage: () => ({ getItem: (key) => drafts.get(key) ?? null, setItem: (key, value) => drafts.set(key, value), removeItem: (key) => drafts.delete(key) }),
    onSaved: (...args) => saved.push(args), onStatus: () => {}, onError: (message) => errors.push(message),
  });
  t.after(() => queue.pauseTimers());
  return { queue, drafts, saved, errors };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("same-document saves are serialized and old acknowledgements cannot replace newer edits", async (t) => {
  const requests = [], resolvers = [];
  const { queue, saved, drafts } = setup(t, (id, patch) => {
    requests.push({ id, patch }); return new Promise((resolve) => resolvers.push(resolve));
  });
  queue.enqueue("a", { title: "first", content: "old body" });
  const first = queue.flush("a");
  queue.enqueue("a", { title: "second", content: "new body" });
  const next = queue.flush("a");
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse([...drafts.values()][0]).content, "new body");
  resolvers[0]({ ...requests[0].patch, updatedAt: "1" });
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.deepEqual(plain(saved[0][2]), {});
  assert.equal(requests[1].patch.content, "new body");
  resolvers[1]({ ...requests[1].patch, updatedAt: "2" });
  await Promise.all([first, next]);
  assert.equal(queue.hasPending, false);
  assert.equal(drafts.size, 0);
});

test("failed requests preserve newer edits and can be retried", async (t) => {
  let reject, fail = true;
  const { queue, drafts, errors } = setup(t, async (_id, patch) => fail ? new Promise((_resolve, no) => { reject = no; }) : { ...patch, updatedAt: "ok" });
  queue.enqueue("a", { title: "first", content: "body" });
  const saving = queue.flush("a");
  queue.enqueue("a", { title: "latest" });
  reject(new Error("offline"));
  assert.equal(await saving, false);
  assert.deepEqual(plain(queue.getDraft("a")), { title: "latest", content: "body" });
  assert.equal(drafts.size, 1);
  assert.deepEqual(errors, ["offline"]);
  fail = false;
  assert.equal(await queue.flush(), true);
  assert.equal(drafts.size, 0);
});

test("draft recovery replays content and metadata without replaying stale hierarchy changes", async (t) => {
  const requests = [];
  const { queue, drafts } = setup(t, async (id, patch) => { requests.push({ id, patch }); return { ...patch, updatedAt: "ok" }; });
  drafts.set("knowledge-desk:draft:a", JSON.stringify({ title: "Recovered", content: "draft", parentId: "old-parent" }));
  queue.restore("a");
  assert.equal(queue.getDraft("a").content, "draft");
  assert.equal(queue.getDraft("a").parentId, undefined);
  await queue.flush();
  assert.equal(requests.length, 1);
  assert.equal(drafts.size, 0);
});

test("discard during a request does not resurrect a deleted document draft", async (t) => {
  let resolve;
  const { queue, drafts, saved } = setup(t, () => new Promise((yes) => { resolve = yes; }));
  queue.enqueue("a", { content: "deleted" });
  const saving = queue.flush("a");
  queue.discard("a");
  resolve({ content: "deleted", updatedAt: "ok" });
  await saving;
  assert.equal(saved.length, 0);
  assert.equal(drafts.size, 0);
  assert.equal(queue.hasPending, false);
});

test("different documents save independently", async (t) => {
  const requests = [];
  const { queue } = setup(t, async (id, patch) => { requests.push(id); return { ...patch, updatedAt: "ok" }; });
  queue.enqueue("a", { content: "a" }); queue.enqueue("b", { content: "b" });
  assert.equal(await queue.flush(), true);
  assert.deepEqual(requests.sort(), ["a", "b"]);
});
