const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const load = require("./load-typescript.cjs");

function harness(locked) {
  const slots = [], requests = [], saves = [], events = [];
  let cursor = 0, flushResult = true;
  let documents = [{ id: "parent", title: "Parent", tags: ["tag"], isLocked: locked, updatedAt: new Date().toISOString() },
    { id: "child", parentId: "parent", title: "Child", tags: [], isLocked: false }];
  const react = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect() {}, useMemo: (fn) => fn(), useCallback: (fn) => fn,
  };
  function Editor() {}
  const dummy = new Proxy({}, { get: (_, name) => name === "__esModule" ? true : () => null });
  const { KnowledgeDesk } = load("app/knowledge-desk.tsx", {
    fetch: (url, options) => {
      events.push("request");
      return new Promise((resolve) => requests.push({ url, options, resolve: (body, ok = true) => resolve({ ok, json: async () => body }) }));
    },
    require: (name, fallback) => {
      if (name === "react") return react;
      if (name === "next/dynamic") return () => Editor;
      if (name === "next/link") return { __esModule: true, default: "a" };
      if (name.endsWith("use-document-library")) return { useDocumentLibrary: () => ({
        documents, selected: documents[0], selectedId: "parent", initialContent: "[]", status: "已自动保存",
        setDocuments: (fn) => { documents = fn(documents); },
        save: (...args) => saves.push(args), setError() {}, setStatus() {},
        flushSaves: async () => { events.push("flush"); return flushResult; },
      }) };
      if (name.endsWith("use-document-knowledge")) return { useDocumentKnowledge: () => ({}) };
      if (name.endsWith("use-stable-callback")) return { useStableCallback: (fn) => fn };
      if (name.endsWith("use-tree-drag-auto-scroll")) return { useTreeDragAutoScroll: () => ({ current: null }) };
      if (name.endsWith("theme-provider")) return { useTheme: () => ({ resolvedTheme: "light" }) };
      if (name.startsWith("@/components/") || name.startsWith("@dnd-kit/")) return dummy;
      return fallback(name);
    },
  });
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
  }
  return {
    requests, saves, events,
    failSaves: () => { flushResult = false; },
    render() {
      cursor = 0;
      const all = nodes(KnowledgeDesk({ initialView: "documents" }));
      return {
        title: all.find((node) => node.props?.["aria-label"] === "文档标题"),
        tag: all.find((node) => node.props?.["aria-label"] === "添加标签"),
        removeTag: all.find((node) => node.props?.className === "doc-tag"),
        editor: all.find((node) => node.type === Editor),
        lock: all.find((node) => /^(解除当前文档的锁定|锁定当前文档)$/.test(node.props?.["aria-label"])),
      };
    },
    documents: () => documents,
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

test("locked documents disable body, title and tags before changes can enter the save queue", () => {
  const h = harness(true), page = h.render();
  assert.equal(page.editor.props.editable, false);
  assert.equal(page.title.props.readOnly, true);
  assert.equal(page.tag.props.disabled, true);
  assert.equal(page.removeTag.props.disabled, true);
  page.title.props.onChange({ target: { value: "blocked" } });
  page.editor.props.onChange("blocked");
  page.removeTag.props.onClick();
  assert.equal(h.saves.length, 0);
});

test("failed drafts do not block unlocking, and retry only happens after unlocking", async () => {
  const h = harness(true);
  h.failSaves();
  h.render().lock.props.onClick();
  assert.deepEqual(h.events, ["request"]);
  assert.equal(JSON.parse(h.requests[0].options.body).isLocked, false);
  h.requests[0].resolve({ ids: ["parent"], isLocked: false });
  await h.settle();
  assert.deepEqual(h.events, ["request", "flush"]);
  const page = h.render();
  assert.equal(page.lock.props.disabled, false);
  assert.equal(page.editor.props.editable, true);
  assert.equal(page.title.props.readOnly, false);
  assert.equal(h.documents()[1].isLocked, false);
});

test("locking waits for saved content, prevents duplicate clicks and leaves children editable", async () => {
  const h = harness(false), page = h.render();
  page.lock.props.onClick(); page.lock.props.onClick();
  assert.equal(h.render().editor.props.editable, false, "read-only while the lock request is pending");
  await h.settle();
  assert.deepEqual(h.events, ["flush", "request"]);
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ ids: ["parent"], isLocked: true });
  await h.settle();
  assert.equal(h.render().editor.props.editable, false);
  assert.equal(h.documents()[1].isLocked, false);
});

test("failed saving or locking keeps the document editable for recovery", async () => {
  const h = harness(false);
  h.failSaves(); h.render().lock.props.onClick(); await h.settle();
  assert.equal(h.requests.length, 0);
  assert.equal(h.render().editor.props.editable, true);
  const retry = harness(false);
  retry.render().lock.props.onClick(); await retry.settle();
  retry.requests[0].resolve({ message: "离线" }, false); await retry.settle();
  assert.equal(retry.render().editor.props.editable, true);
  assert.equal(retry.render().lock.props.disabled, false);
});
