const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToString } = require("react-dom/server");
const load = require("./load-typescript.cjs");
const queue = load("lib/document-save-queue.ts");
const types = load("lib/document-types.ts");
const { useDocumentLibrary } = load("hooks/use-document-library.ts", {
  require: (name) => name === "@/lib/document-save-queue" ? queue : name === "@/lib/document-types" ? types : require(name),
});

test("the document library renders its empty loading state before hydration", () => {
  function InitialPage() {
    const library = useDocumentLibrary(() => {});
    assert.equal(library.initialContent, null);
    assert.equal(library.selected, undefined);
    assert.equal(library.documents.length, 0);
    return React.createElement("div", null, library.status);
  }
  assert.match(renderToString(React.createElement(InitialPage)), /正在载入/);
});
