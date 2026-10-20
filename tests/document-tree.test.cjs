const { test } = require("node:test");
const assert = require("node:assert/strict");
const { indexDocumentTree, documentParentOptions } = require("./load-typescript.cjs")("lib/document-tree.ts");
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
