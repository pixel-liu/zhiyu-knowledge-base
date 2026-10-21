"use client";

import { PartialBlock } from "@blocknote/core";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  AddBlockButton, BlockColorsItem, DragHandleButton, DragHandleMenu, RemoveBlockItem,
  SideMenu, SideMenuController, SuggestionMenuController, useBlockNoteEditor, useComponentsContext, useCreateBlockNote, useExtensionState, useSelectedBlocks,
} from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from "@blocknote/react";
import { useTheme } from "@/components/providers/theme-provider";
import { uploadFile } from "@/lib/upload";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { DocumentSummary } from "@/lib/document-types";
import { documentHref, linkedDocumentId, linkifyInlineContent, type LinkReference } from "@/lib/document-links";
import { useStableCallback } from "@/hooks/use-stable-callback";

type DocumentEditorProps = {
  content: string;
  onChange: (content: string) => void;
  documents: DocumentSummary[];
  bindings?: LinkReference[];
  onSelect: (id: string) => void;
};

function normalizeEscapedCodeFences(markdown: string) {
  const normalizedLines = markdown.replace(/\r\n?/g, "\n");
  const hasEscapedFence = /(^|\n)\s*(?:\\`){3}/.test(normalizedLines);
  const withFencesRestored = normalizedLines.replace(/(^|\n)(\s*)(?:\\`){3}/g, "$1$2```");
  // Some APIs serialize multi-line Markdown with a trailing backslash on each
  // line. Once its escaped fence is restored, those backslashes are transport
  // markers rather than Java source and should not be imported into the block.
  return hasEscapedFence ? withFencesRestored.replace(/\\[ \t]*(?=\n|$)/g, "") : withFencesRestored;
}

function markdownToBlocks(markdown: string): PartialBlock[] {
  const lines = normalizeEscapedCodeFences(markdown).split("\n");
  const blocks: PartialBlock[] = [];
  let inCode = false;
  let codeLanguage = "";
  let codeLines: string[] = [];

  for (const line of lines) {
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      if (inCode) {
        blocks.push({ type: "codeBlock", props: { language: codeLanguage || undefined }, content: codeLines.join("\n") });
        inCode = false;
        codeLines = [];
        codeLanguage = "";
      } else {
        inCode = true;
        codeLanguage = fence[1].trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) continue;
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: "heading", props: { level: heading[1].length }, content: heading[2] });
      continue;
    }
    const checked = line.match(/^\s*- \[([ xX])\]\s+(.+)$/);
    if (checked) {
      blocks.push({ type: "checkListItem", props: { checked: checked[1].toLowerCase() === "x" }, content: checked[2] });
      continue;
    }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: "bulletListItem", content: bullet[1] });
      continue;
    }
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (numbered) {
      blocks.push({ type: "numberedListItem", content: numbered[1] });
      continue;
    }
    blocks.push({ type: "paragraph", content: line });
  }

  if (inCode) blocks.push({ type: "codeBlock", props: { language: codeLanguage || undefined }, content: codeLines.join("\n") });
  return blocks.length ? blocks : [{ type: "paragraph", content: "在这里开始记录…" }];
}

function blockText(block: PartialBlock): string | null {
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) {
    return block.content.map((piece) => typeof piece === "string" ? piece : "text" in piece ? piece.text : "").join("");
  }
  return null;
}

function normalizeSavedMarkdown(blocks: PartialBlock[]) {
  const normalized: PartialBlock[] = [];
  const paragraphBuffer: Array<{ block: PartialBlock; text: string }> = [];
  let migrated = false;
  const markdownPattern = /(^|\n)\s*(#{1,6}\s|```|(?:\\`){3}|[-*+]\s+|\d+[.)]\s+|- \[[ xX]\]\s+)/m;
  const flush = () => {
    if (!paragraphBuffer.length) return;
    const source = paragraphBuffer.map((item) => item.text).join("\n");
    if (markdownPattern.test(source)) {
      normalized.push(...markdownToBlocks(source));
      migrated = true;
    } else {
      normalized.push(...paragraphBuffer.map((item) => item.block));
    }
    paragraphBuffer.length = 0;
  };

  for (const block of blocks) {
    const text = block.type === "paragraph" ? blockText(block) : null;
    if (text !== null) paragraphBuffer.push({ block, text });
    else { flush(); normalized.push(block); }
  }
  flush();
  return { blocks: normalized, migrated };
}

function readBlocks(content: string): { blocks: PartialBlock[]; migrated: boolean } {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) return normalizeSavedMarkdown(parsed as PartialBlock[]);
  } catch {
    // Imported plain-text notes remain readable and editable.
  }

  return { blocks: markdownToBlocks(content || "在这里开始记录…"), migrated: Boolean(content) };
}

const languageNames: Record<string, string> = {
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript",
  jsx: "JSX", tsx: "TSX", java: "Java", py: "Python", python: "Python",
  json: "JSON", css: "CSS", html: "HTML", xml: "XML", bash: "Shell", sh: "Shell",
  shell: "Shell", sql: "SQL", go: "Go", rust: "Rust", c: "C", cpp: "C++",
  text: "纯文本", plaintext: "纯文本", plain: "纯文本",
  "plain text": "纯文本", "plain-text": "纯文本", "text/plain": "纯文本",
  "plan text": "纯文本",
};

function displayLanguage(language: unknown) {
  const value = String(language || "text").trim().toLowerCase();
  return languageNames[value] || (value === "text" ? "纯文本" : String(language || "纯文本"));
}

function QuickBlockMenu() {
  const editor = useBlockNoteEditor();
  const blocks = useSelectedBlocks(editor);
  const components = useComponentsContext();
  if (!components || !blocks.length) return null;
  const Item = components.Generic.Menu.Item;
  const Menu = components.Generic.Menu;
  const changeType = (type: string, props?: Record<string, unknown>) => {
    blocks.forEach((block) => editor.updateBlock(block, { type, props } as never));
  };
  return (
    <DragHandleMenu>
      <Menu.Root position="right" sub>
        <Menu.Trigger sub>
          <Item subTrigger>修改标题</Item>
        </Menu.Trigger>
        <Menu.Dropdown sub>
          {[1, 2, 3, 4, 5, 6].map((level) => (
            <Item key={level} onClick={() => changeType("heading", { level })}>
              {level} 级标题
            </Item>
          ))}
          <Item onClick={() => changeType("paragraph")}>正文</Item>
        </Menu.Dropdown>
      </Menu.Root>
      <Item onClick={() => editor.toggleStyles({ backgroundColor: "yellow" })}>高亮</Item>
      <Item onClick={() => changeType("codeBlock", { language: "text" })}>代码块</Item>
      <Item onClick={() => changeType("numberedListItem")}>有序列表</Item>
      <Item onClick={() => changeType("bulletListItem")}>无序列表</Item>
      <BlockColorsItem>颜色</BlockColorsItem>
      <RemoveBlockItem>删除</RemoveBlockItem>
    </DragHandleMenu>
  );
}

function ZhiyuSideMenu() {
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });
  const hasText = (piece: unknown) => {
    if (typeof piece === "string") return piece.trim().length > 0;
    if (!piece || typeof piece !== "object" || !("text" in piece)) return false;
    const text = (piece as { text?: unknown }).text;
    return typeof text === "string" && text.trim().length > 0;
  };
  const isEmptyParagraph = block?.type === "paragraph" &&
    Array.isArray(block.content) && block.content.every((piece) => !hasText(piece));

  return (
    <SideMenu dragHandleMenu={QuickBlockMenu}>
      {isEmptyParagraph ? <AddBlockButton /> : <DragHandleButton dragHandleMenu={QuickBlockMenu} />}
    </SideMenu>
  );
}

function CompactSuggestionMenu({ items, selectedIndex, onItemClick, loadingState }: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  if (loadingState === "loading-initial" || loadingState === "loading") {
    return <div className="zhiyu-slash-menu" role="listbox"><div className="zhiyu-slash-loading">正在加载…</div></div>;
  }

  const entries = items.map((item, index) => ({ item, index }));
  const primaryGroups = [
    { title: "标题", itemTitles: ["一级标题", "二级标题", "三级标题"] },
    { title: "基础", itemTitles: ["段落", "无序列表", "有序列表", "检查清单", "引用", "可折叠列表", "分隔线"] },
    { title: "副标题", itemTitles: ["四级标题", "五级标题", "六级标题", "可折叠一级标题", "可折叠二级标题", "可折叠三级标题"] },
  ];
  const primaryItemTitles = new Set(primaryGroups.flatMap((group) => group.itemTitles));
  const groups = [
    ...primaryGroups.map(({ title, itemTitles }) => ({
      title,
      items: itemTitles.map((itemTitle) => entries.find(({ item }) => item.title === itemTitle)).filter((entry): entry is { item: DefaultReactSuggestionItem; index: number } => Boolean(entry)),
    })).filter((group) => group.items.length),
    {
      title: "其他功能",
      items: entries.filter(({ item }) => !primaryItemTitles.has(item.title)),
    },
  ].filter((group) => group.items.length);

  return (
    <div className="zhiyu-slash-menu" role="listbox" aria-label="插入内容">
      {groups.map((group) => (
        <section className="zhiyu-slash-group" key={group.title}>
          <div className="zhiyu-slash-group-title">{group.title}</div>
          <div className="zhiyu-slash-grid">
            {group.items.map(({ item, index }) => (
              <button
                className={`zhiyu-slash-item${selectedIndex === index ? " is-selected" : ""}`}
                key={item.title}
                type="button"
                role="option"
                aria-selected={selectedIndex === index}
                aria-label={item.title}
                title={item.subtext ? `${item.title}：${item.subtext}` : item.title}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onItemClick?.(item)}
              >
                {item.icon || <span className="zhiyu-slash-fallback-icon">·</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
      {!items.length && <div className="zhiyu-slash-loading">没有找到匹配内容</div>}
    </div>
  );
}

function decorateCodeBlocks(editor: { document: Array<{ id: string; type: string; props?: Record<string, unknown> }>; domElement?: HTMLElement }) {
  const rootElement = editor.domElement;
  const root = rootElement?.matches(".bn-editor")
    ? rootElement
    : rootElement?.querySelector<HTMLElement>(".bn-editor") || document.querySelector<HTMLElement>(".doc-editor .bn-editor");
  if (!root) return;
  const blocksById = new Map(editor.document.map((block) => [block.id, block]));
  root.querySelectorAll<HTMLElement>('[data-content-type="codeBlock"]').forEach((codeRoot) => {
    const blockElement = codeRoot.closest<HTMLElement>("[data-id]");
    const blockId = blockElement?.dataset.id;
    const block = blockId ? blocksById.get(blockId) : undefined;
    const language = displayLanguage(block?.props?.language);
    const pre = codeRoot.querySelector("pre");
    if (!pre) return;
    const source = pre.textContent || "";
    const lines = Math.max(1, source.split("\n").length);

    let header = codeRoot.querySelector<HTMLElement>(":scope > .zhiyu-code-header");
    if (!header) {
      header = document.createElement("div");
      header.className = "zhiyu-code-header";
      header.setAttribute("contenteditable", "false");
      const label = document.createElement("span");
      label.className = "zhiyu-code-label";
      label.textContent = "代码块";
      const languageLabel = document.createElement("span");
      languageLabel.className = "zhiyu-code-language";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "zhiyu-code-copy";
      copy.textContent = "复制";
      copy.setAttribute("aria-label", "复制代码");
      copy.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const text = pre.textContent || "";
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        }
        copy.textContent = "已复制";
        window.setTimeout(() => { copy.textContent = "复制"; }, 1500);
      });
      header.append(label, languageLabel, copy);
      codeRoot.prepend(header);
    }
    const languageLabel = header.querySelector<HTMLElement>(".zhiyu-code-language");
    if (languageLabel) languageLabel.textContent = language;
    let gutter = codeRoot.querySelector<HTMLElement>(":scope > .zhiyu-code-lines");
    if (!gutter) {
      gutter = document.createElement("div");
      gutter.className = "zhiyu-code-lines";
      gutter.setAttribute("aria-hidden", "true");
      gutter.setAttribute("contenteditable", "false");
      codeRoot.prepend(gutter);
    }
    const lineMarkup = Array.from({ length: lines }, (_, index) => `<span>${index + 1}</span>`).join("");
    if (gutter.innerHTML !== lineMarkup) gutter.innerHTML = lineMarkup;
    codeRoot.dataset.codeLines = String(lines);
    codeRoot.classList.add("zhiyu-code-block");
  });
}

function WikiSuggestionMenu({ items, selectedIndex, onItemClick, loadingState }: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  return <div className="doc-wiki-menu" role="listbox" aria-label="引用文档"><p>选择要引用的文档</p>{items.map((item, index) => <button key={index} type="button" role="option" aria-selected={selectedIndex === index} className={selectedIndex === index ? "is-selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => onItemClick?.(item)}><span>{item.icon}</span><span><b>{item.title}</b><small>{item.subtext}</small></span></button>)}{!items.length && <p>{loadingState === "loading" ? "正在查找…" : "没有匹配的文档，可保留 [[文档名]] 稍后关联。"}</p>}</div>;
}

export const DocumentEditor = memo(function DocumentEditor({ content, onChange, documents, bindings = [], onSelect }: DocumentEditorProps) {
  const { resolvedTheme } = useTheme();
  const [initial] = useState(() => readBlocks(content));
  const migrationApplied = useRef(false);
  const [linkError, setLinkError] = useState("");
  const editor = useCreateBlockNote({
    initialContent: initial.blocks,
    dictionary: zh,
    uploadFile,
    pasteHandler: ({ event, editor: currentEditor, defaultPasteHandler }) => {
      const plainText = event.clipboardData?.getData("text/plain") || "";
      const normalizedText = normalizeEscapedCodeFences(plainText);
      const looksLikeMarkdown = /(^|\n)\s*(#{1,6}\s|```|[-*+]\s+|\d+[.)]\s+|- \[[ xX]\]\s+)/m.test(normalizedText);
      if (looksLikeMarkdown) {
        currentEditor.pasteMarkdown(normalizedText);
        return true;
      }
      return defaultPasteHandler({ prioritizeMarkdownOverHTML: true, plainTextAsMarkdown: true });
    },
  });
  const bufferedChange = useRef(false);
  const normalizingLinks = useRef(false);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizeLinks = useStableCallback(() => {
    if (normalizingLinks.current) return false;
    let changed = false;
    normalizingLinks.current = true;
    try {
      const visit = (blocks: typeof editor.document) => {
        for (const block of blocks) {
          if (block.type !== "codeBlock" && Array.isArray(block.content)) {
            const next = linkifyInlineContent(block.content, documents, bindings);
            if (JSON.stringify(next) !== JSON.stringify(block.content)) { editor.updateBlock(block, { content: next } as never); changed = true; }
          }
          if (block.children?.length) visit(block.children);
        }
      };
      visit(editor.document);
    } finally { normalizingLinks.current = false; }
    return changed;
  });
  const flushChange = useStableCallback(() => {
    if (changeTimer.current) clearTimeout(changeTimer.current);
    changeTimer.current = null;
    if (!bufferedChange.current) return;
    bufferedChange.current = false;
    normalizeLinks();
    onChange(JSON.stringify(editor.document));
  });
  const scheduleChange = useCallback(() => {
    if (normalizingLinks.current) return;
    bufferedChange.current = true;
    // Serialize at most once per 160 ms, even during uninterrupted typing.
    if (!changeTimer.current) changeTimer.current = setTimeout(flushChange, 160);
  }, [flushChange]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { if (normalizeLinks()) onChange(JSON.stringify(editor.document)); });
    return () => window.cancelAnimationFrame(frame);
  }, [editor, documents, bindings, normalizeLinks, onChange]);
  useEffect(() => {
    const onHidden = () => { if (document.hidden) flushChange(); };
    window.addEventListener("pagehide", flushChange);
    window.addEventListener("zhiyu:flush-editor", flushChange);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flushChange);
      window.removeEventListener("zhiyu:flush-editor", flushChange);
      document.removeEventListener("visibilitychange", onHidden);
      flushChange();
    };
  }, [flushChange]);
  useEffect(() => {
    if (initial.migrated && !migrationApplied.current) {
      migrationApplied.current = true;
      onChange(JSON.stringify(editor.document));
    }
  }, [editor, initial.migrated, onChange]);

  useEffect(() => {
    // Do this once after the editor mounts. Observing and mutating the
    // ProseMirror content DOM on every keystroke can reset its selection,
    // which makes it impossible to click out of a code block.
    let cancelled = false;
    let attempts = 0;
    let retry: number | undefined;
    const refresh = () => {
      if (cancelled) return;
      decorateCodeBlocks(editor);
      const hasCodeBlock = editor.domElement?.querySelector('[data-content-type="codeBlock"] pre');
      if (!hasCodeBlock && attempts++ < 20) retry = window.setTimeout(refresh, 100);
    };
    const firstFrame = window.requestAnimationFrame(refresh);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      if (retry !== undefined) window.clearTimeout(retry);
    };
  }, [editor]);

  return (
    <div className="doc-editor-linked" onClickCapture={(event) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      const id = anchor ? linkedDocumentId(anchor.getAttribute("href") || "") : null;
      if (!id || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); event.stopPropagation(); flushChange();
      if (documents.some((document) => document.id === id)) { setLinkError(""); onSelect(id); }
      else setLinkError("这篇文档已删除或不可用。");
    }}>{linkError && <p className="doc-knowledge-error" role="alert">{linkError}</p>}<BlockNoteView
      editor={editor}
      theme={resolvedTheme}
      sideMenu={false}
      slashMenu={false}
      onChange={scheduleChange}
    >
      <SideMenuController sideMenu={ZhiyuSideMenu} />
      <SuggestionMenuController
        triggerCharacter="/"
        suggestionMenuComponent={CompactSuggestionMenu}
      />
      <SuggestionMenuController triggerCharacter="[[" suggestionMenuComponent={WikiSuggestionMenu} getItems={async (query): Promise<DefaultReactSuggestionItem[]> => documents.filter((document) => document.title.toLocaleLowerCase().includes(query.replace(/\]\]$/, "").trim().toLocaleLowerCase())).slice(0,30).map((document) => ({
        title: document.title, icon: <span>{document.icon || "📄"}</span>, subtext: `${document.parentId ? documents.find((parent) => parent.id === document.parentId)?.title || "子文档" : "顶级文档"} · ${document.id.slice(0,6)}`,
        onItemClick: () => { editor.insertInlineContent([{ type: "link", href: documentHref(document.id), content: `[[${document.title}]]` }, " "]); },
      }))} />
    </BlockNoteView></div>
  );
});
