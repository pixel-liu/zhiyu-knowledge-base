const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-typescript.cjs");

// A small hook runner lets requests complete out of order without browser timers.
function harness(t) {
  const slots = [], effects = [], requests = [];
  let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
    },
  };
  const timers = new Map();
  let timerId = 0;
  const { useDocumentKnowledge } = load("hooks/use-document-knowledge.ts", {
    AbortController, Error,
    window: { setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id) },
    fetch: (url, options = {}) => new Promise((resolve) => requests.push({
      url, options,
      resolve: (body, ok = true) => resolve({ ok, json: async () => body }),
      respond: resolve,
    })),
    require: (name, fallback) => name === "react" ? react : fallback(name),
  });
  t.after(() => slots.forEach((slot) => slot?.cleanup?.()));
  return {
    requests,
    render(id = "a", savedAt = "saved", status = "已自动保存") {
      cursor = 0;
      const result = useDocumentKnowledge(id, savedAt, status);
      effects.splice(0).forEach((fn) => fn());
      return result;
    },
    runTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn()); },
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  };
}
const plan = { documentId: "a", version: 1, reviewCount: 0, status: "learning" };

test("an HTML response while reading review status can be retried without changing the plan", async (t) => {
  const h = harness(t);
  h.render();
  h.requests[0].respond(new Response("<!DOCTYPE html><title>Not found</title>", {
    status: 404, headers: { "Content-Type": "text/html" },
  }));
  await h.settle();
  let hook = h.render();
  assert.equal(hook.reviewError, "复习状态加载失败，请重试。");
  assert.equal(hook.failedReviewStatus, undefined);

  hook.refresh();
  h.render();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].url, h.requests[0].url);
  assert.equal(h.requests[1].options.method, undefined);
  h.requests[1].resolve(plan);
  await h.settle();
  hook = h.render();
  assert.equal(hook.reviewError, undefined);
  assert.equal(hook.review, plan);
});

test("review loads during editor saving, and link failures do not prevent enrollment", async (t) => {
  const h = harness(t);
  assert.equal(h.render("a", "draft", "正在保存").reviewLoading, true);
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].url, /\/review$/);
  h.requests[0].resolve(null);
  await h.settle();
  h.render(); h.runTimers();
  const links = h.requests.find((request) => request.url.endsWith("/knowledge"));
  links.resolve({ message: "关联加载失败" }, false);
  await h.settle();
  let hook = h.render();
  assert.equal(hook.data, undefined);
  assert.equal(hook.reviewLoading, false);
  assert.equal(hook.error, "关联加载失败");
  const enrolling = hook.changeReviewStatus("learning");
  h.requests.find((request) => request.options.method === "POST").resolve(plan);
  assert.equal(await enrolling, true);
  hook = h.render();
  assert.equal(hook.review.reviewCount, 0);
  assert.equal(hook.reviewBusy, false);
});

test("late status reads cannot undo removal or re-enrollment, even after switching documents", async (t) => {
  const h = harness(t);
  let hook = h.render();
  const stale = h.requests[0];
  hook.removeReviews(["a"]);
  stale.resolve(plan);
  await h.settle();
  hook = h.render();
  assert.equal(hook.review, null);
  const staleAfterRemoval = h.requests.at(-1);
  const enrolling = hook.changeReviewStatus("learning");
  assert.equal(await hook.changeReviewStatus("learning"), false, "rapid duplicate enrollment is ignored");
  const post = h.requests.at(-1);
  h.render("b");
  h.requests.at(-1).resolve({ ...plan, documentId: "b", version: 20 });
  post.resolve({ ...plan, version: 10 });
  await enrolling;
  staleAfterRemoval.resolve(null);
  await h.settle();
  hook = h.render("b");
  assert.equal(hook.review.documentId, "b");
  hook = h.render("a");
  assert.equal(hook.review.version, 10);
});

test("enrollment failures remain retryable without link data", async (t) => {
  const h = harness(t);
  let hook = h.render();
  const failed = hook.changeReviewStatus("learning");
  h.requests.at(-1).resolve({ message: "保存失败" }, false);
  assert.equal(await failed, false);
  hook = h.render();
  assert.equal(hook.reviewBusy, false);
  assert.equal(hook.reviewError, "保存失败");
  const retry = hook.changeReviewStatus(hook.failedReviewStatus);
  h.requests.at(-1).resolve(plan);
  assert.equal(await retry, true);
  hook = h.render();
  assert.equal(hook.reviewError, undefined);
  assert.equal(hook.review.version, 1);
});
