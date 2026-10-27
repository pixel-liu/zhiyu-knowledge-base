const { test } = require("node:test");
const assert = require("node:assert/strict");
const { documentParentOptions, documentSubtreeIds, indexDocumentTree, toggleDocumentSubtreeSelection } = require("./load-typescript.cjs")("lib/document-tree.ts");
test("tree indexing preserves pinned ordering and nested parent choices", () => {
  const documents = [
    { id: "a", parentId: null, sortOrder: 0, isPinned: false },
    { id: "b", parentId: null, sortOrder: 5, isPinned: true },
    { id: "c", parentId: "a", sortOrder: 0, isPinned: false },
    { id: "orphan", parentId: "missing", sortOrder: 0, isPinned: false },
  ];
  const children = indexDocumentTree(documents);
  assert.deepEqual(Array.from(children.get(null), (item) => item.id), ["b", "a"]);
  assert.deepEqual(Array.from(documentParentOptions(documents, children), (item) => [item.document.id, item.depth]), [["b", 0], ["a", 0], ["c", 1], ["orphan", 0]]);
  assert.equal(documents[0].id, "a");
});

test("tree options keep orphaned descendants together and subtree selection is atomic", () => {
  const documents = [
    { id: "orphan", parentId: "missing", sortOrder: 0, isPinned: false },
    { id: "child", parentId: "orphan", sortOrder: 0, isPinned: false },
    { id: "grandchild", parentId: "child", sortOrder: 0, isPinned: false },
  ];
  const children = indexDocumentTree(documents);
  assert.deepEqual(Array.from(documentParentOptions(documents, children), (item) => [item.document.id, item.depth]), [["orphan", 0], ["child", 1], ["grandchild", 2]]);
  assert.deepEqual(Array.from(documentSubtreeIds("orphan", children)), ["orphan", "child", "grandchild"]);

  const selected = toggleDocumentSubtreeSelection(["outside"], documentSubtreeIds("orphan", children), 20);
  assert.equal(selected.limitExceeded, false);
  assert.deepEqual(Array.from(selected.selectedIds), ["outside", "orphan", "child", "grandchild"]);
  const cleared = toggleDocumentSubtreeSelection(selected.selectedIds, documentSubtreeIds("orphan", children), 20);
  assert.deepEqual(Array.from(cleared.selectedIds), ["outside"]);
});

test("subtree selection refuses partial changes when the document limit would be exceeded", () => {
  const result = toggleDocumentSubtreeSelection(["existing"], ["parent", "child"], 2);
  assert.equal(result.limitExceeded, true);
  assert.deepEqual(Array.from(result.selectedIds), ["existing"]);
});
