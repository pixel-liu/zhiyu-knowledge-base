"use client";

import {
  BookOpen, ChevronDown, ChevronRight, Download, FilePlus2, FileText, FileUp, GripVertical,
  ListTree, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, Trash2,
  Moon, PencilLine, Pin, Sun, Undo2, X,
} from "lucide-react";
import { ChangeEvent as ReactChangeEvent, CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import dynamic from "next/dynamic";
import type { DocumentRecord, DocumentSummary } from "@/lib/document-types";
import { indexDocumentTree, documentParentOptions } from "@/lib/document-tree";
import { useDocumentLibrary } from "@/hooks/use-document-library";
import { useStableCallback } from "@/hooks/use-stable-callback";

const loadDocumentEditor = () => import("@/components/document-editor");
const DocumentEditor = dynamic(() => loadDocumentEditor().then((module) => module.DocumentEditor), {
  ssr: false,
  loading: () => <p className="doc-body-loading" role="status">正在加载编辑器…</p>,
});
import { useTheme } from "@/components/providers/theme-provider";
import { useTreeDragAutoScroll } from "@/hooks/use-tree-drag-auto-scroll";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const readJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "操作失败");
  return response.json() as Promise<T>;
};

const formatTime = (value: string) => new Intl.DateTimeFormat("zh-CN", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

function headingsFrom(content: string) {
  try {
    return (JSON.parse(content) as Array<{ type?: string; props?: { level?: number }; content?: string | Array<{ text?: string }> }>)
      .map((block, index) => ({
        id: `heading-${index}`,
        index,
        level: block.type === "heading" ? Number(block.props?.level ?? 1) : 0,
        text: typeof block.content === "string"
          ? block.content
          : Array.isArray(block.content)
            ? block.content.map((piece) => piece.text ?? "").join("")
            : "",
      }))
      .filter((item) => item.level && item.text)
      .map((item, headingIndex) => ({ ...item, headingIndex }));
  } catch { return []; }
}

function SortableTreeRow({ document, selectedId, hasChildren, expanded, depth, onSelect, onToggle, onNewChild, onContextMenu, onMove }: {
  document: DocumentSummary; selectedId: string | null; hasChildren: boolean; expanded: boolean; depth: number;
  onSelect: (id: string) => void; onToggle: (id: string) => void; onNewChild: (parentId: string) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>, id: string) => void;
  onMove: (id: string, parentId: string | null) => void;
}) {
  const sortable = useSortable({ id: document.id });
  const [isDropTarget, setIsDropTarget] = useState(false);
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return (
    <div ref={sortable.setNodeRef} style={style} draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", document.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer.types.includes("text/plain")) setIsDropTarget(true); }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDropTarget(false); }} onDragEnd={() => setIsDropTarget(false)} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setIsDropTarget(false); const id = event.dataTransfer.getData("text/plain"); if (id && id !== document.id) onMove(id, document.id); }} className={`doc-tree-row ${selectedId === document.id ? "is-active" : ""} ${isDropTarget ? "is-drop-target" : ""}`} onContextMenu={(event) => onContextMenu(event, document.id)}>
      <button className="doc-tree-select" style={{ paddingLeft: 12 + depth * 16 }} onClick={() => onSelect(document.id)}>
        {hasChildren ? <span className="doc-tree-chevron" onClick={(event) => { event.stopPropagation(); onToggle(document.id); }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span> : <span className="doc-tree-chevron placeholder" />}
        <span className="doc-icon">{document.icon || "📄"}</span>
        <span className="doc-tree-title">{document.title || "未命名文档"}</span>
        {document.isPinned && <Pin className="doc-pin" size={13} />}
      </button>
      <span className="doc-tree-tools">
        <button title="新建子文档" onClick={() => onNewChild(document.id)}><FilePlus2 size={14} /></button>
        <span className="doc-drag" {...sortable.attributes} {...sortable.listeners} title="拖动文档；放到另一篇文档上可成为其子文档"><GripVertical size={14} /></span>
      </span>
    </div>
  );
}

const DocumentTree = memo(function DocumentTreeLevel({ childrenByParent, parentId = null, depth = 0, selectedId, expanded, onSelect, onToggle, onNewChild, onReorder, onContextMenu, onMove }: {
  childrenByParent: Map<string | null, DocumentSummary[]>; parentId?: string | null; depth?: number; selectedId: string | null; expanded: Set<string>;
  onSelect: (id: string) => void; onToggle: (id: string) => void; onNewChild: (parentId: string) => void;
  onReorder: (parentId: string | null, orderedIds: string[]) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLDivElement>, id: string) => void;
  onMove: (id: string, parentId: string | null) => void;
}) {
  const siblings = childrenByParent.get(parentId) ?? [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const activeRect = event.active.rect.current.translated;
    const overRect = event.over.rect;
    const droppedOnCenter = activeRect && Math.abs(
      activeRect.top + activeRect.height / 2 - (overRect.top + overRect.height / 2)
    ) < overRect.height * 0.3;
    if (droppedOnCenter) {
      onMove(String(event.active.id), String(event.over.id));
      return;
    }
    const ids = siblings.map((item) => item.id);
    const from = ids.indexOf(String(event.active.id)); const to = ids.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]); onReorder(parentId, ids);
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={siblings.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {siblings.map((document) => {
          const hasChildren = Boolean(childrenByParent.get(document.id)?.length);
          return <div key={document.id}>
            <SortableTreeRow document={document} selectedId={selectedId} hasChildren={hasChildren} expanded={expanded.has(document.id)} depth={depth} onSelect={onSelect} onToggle={onToggle} onNewChild={onNewChild} onContextMenu={onContextMenu} onMove={onMove} />
            {hasChildren && expanded.has(document.id) && <DocumentTree childrenByParent={childrenByParent} parentId={document.id} depth={depth + 1} selectedId={selectedId} expanded={expanded} onSelect={onSelect} onToggle={onToggle} onNewChild={onNewChild} onReorder={onReorder} onContextMenu={onContextMenu} onMove={onMove} />}
          </div>;
        })}
      </SortableContext>
    </DndContext>
  );
});

export function KnowledgeDesk() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set<string>());
  const onDocumentsLoaded = useCallback((items: DocumentSummary[]) => {
    setExpanded(new Set(items.flatMap((item) => item.parentId ? [item.parentId] : [])));
  }, []);
  const { documents, setDocuments, selected, selectedId, setSelectedId, initialContent, status, setStatus, error, setError,
    loadDocuments, save, updateLocal, rememberDocument, discardDocuments } = useDocumentLibrary(onDocumentsLoaded);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const treeRef = useTreeDragAutoScroll(sidebarOpen);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(292);
  const [outlineWidth, setOutlineWidth] = useState(292);
  const [resizingPane, setResizingPane] = useState<"sidebar" | "outline" | null>(null);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [outlineTooltip, setOutlineTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportAll, setExportAll] = useState(false);
  const [backupConfirm, setBackupConfirm] = useState<{ format: "json" | "markdown"; all: boolean } | null>(null);
  const [markdownImport, setMarkdownImport] = useState<{ fileName: string; title: string; content: string; parentId: string | null; format: "markdown" | "json" } | null>(null);
  const [importingMarkdown, setImportingMarkdown] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [purgingTrash, setPurgingTrash] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummary | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<{ source: DocumentSummary; parent: DocumentSummary } | null>(null);
  const [query, setQuery] = useState("");
  const [searchTag, setSearchTag] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [searchResults, setSearchResults] = useState<DocumentSummary[]>([]);
  const [trash, setTrash] = useState<DocumentSummary[]>([]);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  const titleInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const markdownInput = useRef<HTMLInputElement>(null);
  const resizeSession = useRef<{ pane: "sidebar" | "outline"; pointerId: number; startX: number; startWidth: number } | null>(null);

  const [liveOutline, setLiveOutline] = useState<{ id: string; items: ReturnType<typeof headingsFrom> } | null>(null);
  const outline = useMemo(() => liveOutline && liveOutline.id === selected?.id ? liveOutline.items : headingsFrom(initialContent ?? ""), [initialContent, liveOutline, selected?.id]);
  const activeDocumentId = selected?.id;
  const tags = useMemo(() => [...new Set(documents.flatMap((item) => item.tags || []))].sort((a, b) => a.localeCompare(b, "zh-CN")), [documents]);
  const childrenByParent = useMemo(() => indexDocumentTree(documents), [documents]);
  const parentOptions = useMemo(() => documentParentOptions(documents, childrenByParent), [documents, childrenByParent]);

  const onEditorChange = useCallback((content: string) => {
    if (!activeDocumentId) return;
    save(activeDocumentId, { content });
    const items = headingsFrom(content);
    setLiveOutline((current) => current?.id === activeDocumentId && JSON.stringify(current.items) === JSON.stringify(items) ? current : { id: activeDocumentId, items });
  }, [save, activeDocumentId]);
  const toggleExpanded = useCallback((id: string) => setExpanded((items) => {
    const next = new Set(items);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  useEffect(() => {
    // Fetch the large editor chunk while directory metadata and the first body load.
    void loadDocumentEditor().catch(() => undefined);
    setMounted(true);
    const savedSidebarWidth = Number(window.localStorage.getItem("knowledge-desk:sidebar-width"));
    const savedOutlineWidth = Number(window.localStorage.getItem("knowledge-desk:outline-width"));
    if (Number.isFinite(savedSidebarWidth) && savedSidebarWidth > 0) setSidebarWidth(Math.max(220, Math.min(480, savedSidebarWidth)));
    if (Number.isFinite(savedOutlineWidth) && savedOutlineWidth > 0) setOutlineWidth(Math.max(220, Math.min(480, savedOutlineWidth)));
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem("knowledge-desk:sidebar-width", String(sidebarWidth));
      window.localStorage.setItem("knowledge-desk:outline-width", String(outlineWidth));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [mounted, sidebarWidth, outlineWidth]);
  useEffect(() => { if (selectedId) window.localStorage.setItem("knowledge-desk:selected", selectedId); }, [selectedId]);
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKeydown); return () => window.removeEventListener("keydown", onKeydown);
  }, []);
  useEffect(() => {
    const closeContextMenu = (event?: Event) => {
      setContextMenu(null);
      const target = event?.target as HTMLElement | null;
      if (!target?.closest?.(".doc-more-wrap")) setMoreOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDeleteTarget(null);
      setMarkdownImport(null);
      setMoreOpen(false);
      closeContextMenu();
    };
    window.addEventListener("pointerdown", closeContextMenu);
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("keydown", closeWithEscape);
    return () => { window.removeEventListener("pointerdown", closeContextMenu); window.removeEventListener("click", closeContextMenu); window.removeEventListener("keydown", closeWithEscape); };
  }, []);
  useEffect(() => {
    if (!searchOpen) return;
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, tag: searchTag });
      void fetch(`/api/search?${params}`, { signal: controller.signal }).then(readJson<DocumentSummary[]>)
        .then((items) => { if (!controller.signal.aborted) setSearchResults(items); })
        .catch(() => { if (!controller.signal.aborted) setSearchResults([]); });
    }, 180);
    return () => { window.clearTimeout(handle); controller.abort(); };
  }, [query, searchTag, searchOpen]);

  useEffect(() => {
    if (!activeDocumentId || !outline.length) {
      const frame = window.requestAnimationFrame(() => setActiveOutlineId(null));
      return () => window.cancelAnimationFrame(frame);
    }
    let frame: number | null = null;
    const updateActiveOutline = () => {
      frame = null;
      const headingNodes = Array.from(document.querySelectorAll<HTMLElement>("#document-editor [data-content-type='heading']"));
      if (!headingNodes.length) return;
      const topbarBottom = document.querySelector<HTMLElement>(".doc-topbar")?.getBoundingClientRect().bottom ?? 0;
      const threshold = topbarBottom + 12;
      let activeIndex = 0;
      headingNodes.forEach((node, index) => {
        if (node.getBoundingClientRect().top <= threshold) activeIndex = index;
      });
      const nextId = outline[activeIndex]?.id ?? outline[0]?.id ?? null;
      setActiveOutlineId((current) => current === nextId ? current : nextId);
    };
    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateActiveOutline);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateActiveOutline);
    const firstFrame = window.requestAnimationFrame(updateActiveOutline);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateActiveOutline);
      window.cancelAnimationFrame(firstFrame);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [activeDocumentId, outline]);
  const choose = useCallback((id: string) => { setSelectedId(id); setTagDraft(""); setSearchOpen(false); setTrashOpen(false); }, [setSelectedId]);

  const addTag = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    const tag = tagDraft.trim().replace(/^#/, "").replace(/,/g, "");
    if (!selected || !tag || selected.tags.includes(tag)) { setTagDraft(""); return; }
    save(selected.id, { tags: [...selected.tags, tag].slice(0, 30) });
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    if (selected) save(selected.id, { tags: selected.tags.filter((item) => item !== tag) });
  };

  const importBackupFile = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
      const result = await readJson<{ imported: number }>(response);
      await loadDocuments();
      setMoreOpen(false);
      setStatus(`已导入 ${result.imported} 篇文档`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入备份失败"); }
  };

  const selectMarkdownFile = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMoreOpen(false);
    if (!/\.(?:md|markdown|json)$/i.test(file.name)) { setError("请选择 .md、.markdown 或 .json 文件"); return; }
    if (file.size > 10_000_000) { setError("导入文件不能超过 10 MB"); return; }
    try {
      const rawContent = await file.text();
      const isJson = /\.json$/i.test(file.name);
      let content = rawContent;
      if (isJson) {
        try {
          const formatted = JSON.stringify(JSON.parse(rawContent), null, 2);
          content = JSON.stringify([{ type: "codeBlock", props: { language: "json" }, content: formatted }]);
        } catch { setError("JSON 文件格式无效，请检查内容后重试"); return; }
      }
      if (content.length > 10_000_000) { setError("格式化后的文件内容不能超过 10 MB"); return; }
      setMarkdownImport({
        fileName: file.name,
        title: file.name.replace(/\.(?:md|markdown|json)$/i, "").trim() || "导入文档",
        content,
        parentId: null,
        format: isJson ? "json" : "markdown",
      });
    } catch { setError("无法读取导入文件"); }
  };

  const importMarkdownFile = async () => {
    if (!markdownImport || importingMarkdown) return;
    setImportingMarkdown(true);
    try {
      const document = await readJson<DocumentRecord>(await fetch(markdownImport.format === "markdown" ? "/api/import/markdown" : "/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: markdownImport.parentId, title: markdownImport.title, content: markdownImport.content }),
      }));
      setDocuments((items) => [...items, rememberDocument(document)]);
      if (document.parentId) setExpanded((items) => new Set([...items, document.parentId!]));
      setMarkdownImport(null);
      choose(document.id);
      setStatus(`已导入「${document.title}」`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "导入文件失败"); }
    finally { setImportingMarkdown(false); }
  };

  const requestExport = (format: "json" | "markdown") => {
    if (!selected?.id) { setError("没有可导出的文档"); return; }
    setMoreOpen(false);
    setBackupConfirm({ format, all: exportAll });
  };
  const performExport = () => {
    const pending = backupConfirm;
    if (!pending || !selected?.id) return;
    const params = new URLSearchParams({ format: pending.format, documentId: selected.id });
    if (pending.all) {
      params.set("all", "true");
      params.delete("documentId");
    }
    setBackupConfirm(null);
    window.location.href = `/api/backup?${params.toString()}`;
  };
  const create = useStableCallback(async (parentId: string | null = null) => {
    try {
      const document = await readJson<DocumentRecord>(await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId }) }));
      setDocuments((items) => [...items, rememberDocument(document)]); if (parentId) setExpanded((items) => new Set([...items, parentId])); choose(document.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "新建失败"); }
  });
  const reorder = useStableCallback(async (parentId: string | null, orderedIds: string[]) => {
    const orders = new Map(orderedIds.map((id, index) => [id, index]));
    setDocuments((items) => items.map((item) => item.parentId === parentId ? { ...item, sortOrder: orders.get(item.id) ?? item.sortOrder } : item));
    await fetch("/api/documents/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId, documentIds: orderedIds }) });
  });
  const moveDocument = useStableCallback(async (id: string, parentId: string | null, confirmed = false) => {
    const source = documents.find((item) => item.id === id);
    if (!source || source.id === parentId || source.parentId === parentId) return;
    const parent = parentId ? documents.find((item) => item.id === parentId) : null;
    if (parentId && !parent) return;
    let ancestor = parent;
    while (ancestor) {
      if (ancestor.id === id) return;
      ancestor = ancestor.parentId ? documents.find((item) => item.id === ancestor?.parentId) ?? null : null;
    }
    if (parent && !confirmed) {
      setMoveConfirm({ source, parent });
      return;
    }
    const maxOrder = Math.max(-1, ...documents.filter((item) => item.parentId === parentId && item.id !== id).map((item) => item.sortOrder));
    updateLocal(id, { parentId, sortOrder: maxOrder + 1 });
    if (parentId) setExpanded((items) => new Set([...items, parentId]));
    try { await readJson<DocumentRecord>(await fetch(`/api/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "移动文档失败"); void loadDocuments(); }
  });
  const togglePin = async (id: string) => {
    const target = documents.find((item) => item.id === id);
    if (!target) return;
    const next = !target.isPinned;
    updateLocal(id, { isPinned: next });
    setContextMenu(null);
    try { await readJson<DocumentRecord>(await fetch(`/api/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPinned: next }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "置顶失败"); void loadDocuments(); }
  };
  const requestRemove = (id = selected?.id) => {
    const target = documents.find((item) => item.id === id);
    if (target) setDeleteTarget(target);
  };
  const remove = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    const response = await fetch(`/api/documents/${target.id}`, { method: "DELETE" });
    if (!response.ok) { setError("移入回收站失败"); return; }
    const deleted = new Set([target.id]); let changed = true;
    while (changed) { changed = false; documents.forEach((item) => { if (item.parentId && deleted.has(item.parentId) && !deleted.has(item.id)) { deleted.add(item.id); changed = true; } }); }
    discardDocuments([...deleted]);
    const remaining = documents.filter((item) => !deleted.has(item.id)); setDocuments(remaining); setSelectedId(remaining[0]?.id ?? null);
  };
  const openTrash = async () => {
    setTrashOpen(true);
    setTrash(await readJson<DocumentSummary[]>(await fetch("/api/documents?deletedOnly=true")));
  };
  const clearTrash = async () => {
    if (!trash.length || purgingTrash || !window.confirm("确定要永久删除回收站中的所有文档吗？此操作无法撤销。")) return;
    setPurgingTrash(true);
    try {
      const deletedIds = new Set(trash.map((item) => item.id));
      const roots = trash.filter((item) => !item.parentId || !deletedIds.has(item.parentId));
      const responses = await Promise.all(roots.map((item) => fetch(`/api/documents/${item.id}?permanent=true`, { method: "DELETE" })));
      if (responses.some((response) => !response.ok)) throw new Error("清空回收站失败");
      setTrash([]);
      setStatus("回收站已清空");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "清空回收站失败");
    } finally {
      setPurgingTrash(false);
    }
  };
  const restore = async (id: string) => {
    const restored = await readJson<DocumentRecord>(await fetch(`/api/documents/${id}/restore`, { method: "POST" }));
    setTrash((items) => items.filter((item) => item.id !== id)); await loadDocuments(); choose(restored.id);
  };
  const rename = (id: string) => {
    choose(id); setContextMenu(null);
    window.setTimeout(() => { titleInput.current?.focus(); titleInput.current?.select(); }, 0);
  };
  const openContextMenu = useStableCallback((event: ReactMouseEvent<HTMLDivElement>, id: string) => {
    event.preventDefault();
    setContextMenu({ id, x: Math.min(event.clientX, window.innerWidth - 176), y: Math.min(event.clientY, window.innerHeight - 116) });
  });
  const paneMaxWidth = (pane: "sidebar" | "outline") => {
    const otherPaneWidth = pane === "sidebar"
      ? (window.innerWidth > 980 && selected ? (outlineOpen ? outlineWidth : 48) : 0)
      : (sidebarOpen ? sidebarWidth : 0);
    return Math.max(220, Math.min(480, window.innerWidth - otherPaneWidth - 430));
  };
  const updatePaneWidth = (pane: "sidebar" | "outline", width: number) => {
    const next = Math.max(220, Math.min(paneMaxWidth(pane), width));
    if (pane === "sidebar") setSidebarWidth(next);
    else setOutlineWidth(next);
  };
  const startPaneResize = (pane: "sidebar" | "outline", event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSession.current = {
      pane,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: pane === "sidebar" ? sidebarWidth : outlineWidth,
    };
    setResizingPane(pane);
  };
  const movePaneResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const delta = event.clientX - session.startX;
    updatePaneWidth(session.pane, session.startWidth + (session.pane === "sidebar" ? delta : -delta));
  };
  const endPaneResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resizeSession.current = null;
    setResizingPane(null);
  };
  const resizePaneWithKeyboard = (pane: "sidebar" | "outline", event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const current = pane === "sidebar" ? sidebarWidth : outlineWidth;
    updatePaneWidth(pane, current + direction * (pane === "sidebar" ? 16 : -16));
  };
  const paneDivider = (pane: "sidebar" | "outline") => {
    const value = pane === "sidebar" ? sidebarWidth : outlineWidth;
    const label = pane === "sidebar" ? "调整文档栏宽度" : "调整大纲栏宽度";
    return <div
      className={`doc-pane-resizer doc-${pane}-resizer ${resizingPane === pane ? "is-active" : ""}`}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={220}
      aria-valuemax={480}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title={`${label}；双击恢复默认宽度`}
      onPointerDown={(event) => startPaneResize(pane, event)}
      onPointerMove={movePaneResize}
      onPointerUp={endPaneResize}
      onPointerCancel={endPaneResize}
      onLostPointerCapture={() => { resizeSession.current = null; setResizingPane(null); }}
      onKeyDown={(event) => resizePaneWithKeyboard(pane, event)}
      onDoubleClick={() => updatePaneWidth(pane, 292)}
    />;
  };
  const darkMode = mounted && resolvedTheme === "dark";

  return <div className="docspace">
    <header className="doc-topbar"><div className="doc-topbar-left"><BookOpen size={19} /><b>知屿文档</b><span>我的文档库</span></div><div className="doc-topbar-actions"><span className={`doc-save-status ${status === "正在保存" ? "saving" : ""}`}><i />{status}</span><button title={mounted ? (darkMode ? "切换为白色模式" : "切换为黑色模式") : "切换主题"} aria-label={mounted ? (darkMode ? "切换为白色模式" : "切换为黑色模式") : "切换主题"} onClick={() => setTheme(darkMode ? "light" : "dark")}>{mounted && darkMode ? <Sun size={18} /> : <Moon size={18} />}</button><button title="搜索" onClick={() => setSearchOpen(true)}><Search size={18} /></button><div className="doc-more-wrap"><button title="更多功能" onClick={() => setMoreOpen((value) => !value)}><MoreHorizontal size={19} /></button>{moreOpen && <div className="doc-more-menu" onClick={(event) => event.stopPropagation()}><button onClick={() => requestExport("json")}><span>导出 JSON 备份</span><small>{exportAll ? "完整文档库" : "当前文档"}</small></button><div className="doc-backup-toggle-row"><span>全量备份</span><button type="button" className={`doc-backup-toggle ${exportAll ? "is-on" : ""}`} aria-pressed={exportAll} aria-label={exportAll ? "关闭全量备份" : "开启全量备份"} onClick={(event) => { event.stopPropagation(); setExportAll((value) => !value); }}><span><i /></span></button></div><button onClick={() => requestExport("markdown")}><span>导出 Markdown</span><small>{exportAll ? "完整文档库" : "当前文档"}</small></button><button onClick={() => markdownInput.current?.click()}><span>导入文档</span><small>Markdown / JSON，可选择父级</small></button><button onClick={() => backupInput.current?.click()}><span>导入备份</span><small>合并到当前文档库</small></button></div>}<input ref={markdownInput} className="doc-hidden-input" type="file" accept="text/markdown,application/json,.md,.markdown,.json" onChange={(event) => void selectMarkdownFile(event)} /><input ref={backupInput} className="doc-hidden-input" type="file" accept="application/json,.json" onChange={(event) => void importBackupFile(event)} /></div></div></header>
    <div className={`doc-layout ${resizingPane ? "is-resizing" : ""}`} style={{ "--sidebar-width": `${sidebarWidth}px`, "--outline-width": `${outlineWidth}px` } as CSSProperties}>
      {sidebarOpen && <><aside className="doc-sidebar"><div className="doc-sidebar-tools"><button className="doc-new" onClick={() => create()}><FilePlus2 size={16} />新建文档</button><button className="doc-search" onClick={() => setSearchOpen(true)}><Search size={16} /><span>搜索</span><kbd>Ctrl K</kbd></button></div><div className="doc-sidebar-label"><span>我的文档库</span><span className="doc-sidebar-label-actions"><button onClick={() => create()} title="新建文档"><FilePlus2 size={15} /></button><button onClick={() => setSidebarOpen(false)} title="收起左侧面板" aria-label="收起左侧面板"><PanelLeftClose size={15} /></button></span></div><nav ref={treeRef} className="doc-tree" aria-label="文档树" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (id) void moveDocument(id, null); }}><DocumentTree childrenByParent={childrenByParent} selectedId={selected?.id ?? null} expanded={expanded} onSelect={choose} onToggle={toggleExpanded} onNewChild={create} onReorder={reorder} onContextMenu={openContextMenu} onMove={moveDocument} /></nav><div className="doc-sidebar-bottom"><button onClick={() => void openTrash()}><Trash2 size={16} />回收站</button><p>文档保存在这台电脑的本地数据库中。</p></div></aside>{paneDivider("sidebar")}</>}
      <section className="doc-workbench"><button className="doc-collapse" onClick={() => setSidebarOpen((value) => !value)} title="收起/展开文档库">{sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>{selected ? <main className="doc-canvas"><div className="doc-breadcrumb">我的文档库 <ChevronRight size={14} /> {selected.parentId ? documents.find((item) => item.id === selected.parentId)?.title || "子文档" : "文档"}</div><input ref={titleInput} className="doc-title-input" value={selected.title} onChange={(event) => save(selected.id, { title: event.target.value })} placeholder="未命名文档" aria-label="文档标题" /><div className="doc-meta"><span>{selected.icon || "📄"}</span><span>最后修改：{formatTime(selected.updatedAt)}</span><button onClick={() => requestRemove()}><Trash2 size={15} />移入回收站</button></div><div className="doc-tags"><span className="doc-tags-label">标签</span>{selected.tags.map((tag) => <button type="button" className="doc-tag" key={tag} onClick={() => removeTag(tag)} title="移除标签">#{tag}<X size={11} /></button>)}<input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={addTag} placeholder="输入标签后按回车" aria-label="添加标签" /></div><div className="doc-editor" id="document-editor">{initialContent === null ? <p className="doc-body-loading" role="status">正在加载文档…</p> : <DocumentEditor key={selected.id} content={initialContent} onChange={onEditorChange} />}</div></main> : <main className="doc-empty"><FileText size={34} /><h1>创建第一篇文档</h1><p>从左侧新建文档，内容会自动保存到本机。</p><button className="doc-new" onClick={() => create()}><FilePlus2 size={16} />新建文档</button></main>}</section>
      {selected && <>{outlineOpen && paneDivider("outline")}<aside className={`doc-outline ${outlineOpen ? "" : "is-collapsed"}`}><div className="doc-outline-title"><span>大纲</span><button onClick={() => setOutlineOpen((value) => !value)} title={outlineOpen ? "收起右侧目录" : "展开右侧目录"} aria-label={outlineOpen ? "收起右侧目录" : "展开右侧目录"}>{outlineOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}</button></div>{outlineOpen && (outline.length ? <nav>{outline.map((item) => <a key={item.id} className={`outline-level-${item.level} ${activeOutlineId === item.id ? "is-active" : ""}`} href="#document-editor" aria-label={item.text} onMouseEnter={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setOutlineTooltip({ text: item.text, x: rect.left + rect.width / 2, y: rect.top - 8 }); }} onMouseLeave={() => setOutlineTooltip(null)} onClick={(event) => { event.preventDefault(); setOutlineTooltip(null); setActiveOutlineId(item.id); document.querySelectorAll("#document-editor [data-content-type='heading']")[item.headingIndex]?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{item.text}</a>)}</nav> : <p>为正文添加标题后，会在这里显示文档大纲。</p>)}</aside></>}
    </div>
    {error && <div className="doc-toast">{error}<button onClick={() => setError("")}><X size={15} /></button></div>}
    {moveConfirm && <AlertDialog open onOpenChange={(open) => { if (!open) setMoveConfirm(null); }}>
      <AlertDialogContent className="doc-confirm-modal doc-move-confirm-modal">
        <div className="doc-confirm-icon"><ListTree size={20} /></div>
        <div>
          <AlertDialogTitle>确认设为子文档？</AlertDialogTitle>
          <AlertDialogDescription>将「{moveConfirm.source.title || "未命名文档"}」移动到「{moveConfirm.parent.title || "未命名文档"}」下，成为它的子文档。</AlertDialogDescription>
        </div>
        <div className="doc-confirm-actions">
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction className="primary" onClick={() => {
            const pending = moveConfirm;
            setMoveConfirm(null);
            void moveDocument(pending.source.id, pending.parent.id, true);
          }}>确认移动</AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>}
    {outlineTooltip && <div className="doc-outline-tooltip" role="tooltip" style={{ left: outlineTooltip.x, top: outlineTooltip.y }}>{outlineTooltip.text}</div>}
    {contextMenu && <div className="doc-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><button onClick={() => void togglePin(contextMenu.id)}><Pin size={15} />{documents.find((item) => item.id === contextMenu.id)?.isPinned ? "取消置顶" : "置顶文档"}</button><button onClick={() => rename(contextMenu.id)}><PencilLine size={15} />重命名</button><button className="danger" onClick={() => { const id = contextMenu.id; setContextMenu(null); requestRemove(id); }}><Trash2 size={15} />移入回收站</button></div>}
    {markdownImport && <div className="doc-modal-backdrop doc-confirm-backdrop" onMouseDown={() => !importingMarkdown && setMarkdownImport(null)}><section className="doc-import-modal" role="dialog" aria-modal="true" aria-labelledby="document-import-title" onMouseDown={(event) => event.stopPropagation()}><div className="doc-import-heading"><span><FileUp size={18} /></span><div><h2 id="document-import-title">{markdownImport.format === "json" ? "导入 JSON" : "导入 Markdown"}</h2><p title={markdownImport.fileName}>{markdownImport.fileName}</p></div></div><label><span>文档标题</span><input autoFocus value={markdownImport.title} maxLength={200} onChange={(event) => setMarkdownImport((current) => current ? { ...current, title: event.target.value } : current)} /></label><label><span>保存位置</span><select value={markdownImport.parentId ?? ""} onChange={(event) => setMarkdownImport((current) => current ? { ...current, parentId: event.target.value || null } : current)}><option value="">顶级文档（默认新增）</option>{parentOptions.map(({ document, depth }) => <option key={document.id} value={document.id}>{`${"　".repeat(depth)}${depth ? "└ " : ""}${document.title || "未命名文档"}`}</option>)}</select><small>{markdownImport.parentId ? `将成为「${documents.find((item) => item.id === markdownImport.parentId)?.title || "所选文档"}」的子文档` : "将在文档库顶层新建一篇文档"}</small></label><div className="doc-confirm-actions"><button disabled={importingMarkdown} onClick={() => setMarkdownImport(null)}>取消</button><button className="primary" disabled={importingMarkdown || !markdownImport.title.trim()} onClick={() => void importMarkdownFile()}>{importingMarkdown ? "导入中…" : "导入文档"}</button></div></section></div>}
    {backupConfirm && <div className="doc-modal-backdrop doc-confirm-backdrop" onMouseDown={() => setBackupConfirm(null)}><section className="doc-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="backup-confirm-title" onMouseDown={(event) => event.stopPropagation()}><div className="doc-confirm-icon"><Download size={20} /></div><div><h2 id="backup-confirm-title">确认导出备份？</h2><p>{backupConfirm.all ? "将导出整个文档库。" : `将只导出当前文档「${selected?.title || "未命名文档"}」。`}格式：{backupConfirm.format === "json" ? "JSON" : "Markdown"}。</p></div><div className="doc-confirm-actions"><button onClick={() => setBackupConfirm(null)}>取消</button><button className="danger" onClick={performExport}>确认导出</button></div></section></div>}    {searchOpen && <div className="doc-modal-backdrop" onMouseDown={() => setSearchOpen(false)}><section className="doc-search-modal" onMouseDown={(event) => event.stopPropagation()}><div><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题和正文内容" /><button onClick={() => setSearchOpen(false)}><X size={18} /></button></div><div className="doc-search-filters"><button className={!searchTag ? "is-active" : ""} onClick={() => setSearchTag("")}>全部</button>{tags.map((tag) => <button key={tag} className={searchTag === tag ? "is-active" : ""} onClick={() => setSearchTag(tag)}>#{tag}</button>)}</div><small>{query || searchTag ? `${searchResults.length} 个匹配结果` : "最近编辑"}</small><nav>{(query || searchTag) && !searchResults.length ? <p>没有找到相关文档</p> : searchResults.map((item) => <button key={item.id} onClick={() => choose(item.id)}><span>{item.icon || "📄"}</span><b>{item.title}</b><em>{item.snippet || "空文档"}</em></button>)}</nav></section></div>}
    {trashOpen && <div className="doc-modal-backdrop" onMouseDown={() => setTrashOpen(false)}><section className="doc-trash-modal" onMouseDown={(event) => event.stopPropagation()}><div className="doc-modal-title"><span><Trash2 size={18} />回收站</span><div className="doc-trash-actions"><button className="doc-trash-clear" disabled={!trash.length || purgingTrash} onClick={() => void clearTrash()}><Trash2 size={14} />{purgingTrash ? "删除中…" : "一键删除"}</button><button onClick={() => setTrashOpen(false)} aria-label="关闭回收站"><X size={18} /></button></div></div>{trash.length ? trash.map((item) => <div className="doc-trash-item" key={item.id}><span>{item.icon || "📄"}</span><div><b>{item.title}</b><small>删除于 {item.deletedAt ? formatTime(item.deletedAt) : "刚刚"}</small></div><button onClick={() => void restore(item.id)}><Undo2 size={15} />恢复</button></div>) : <p className="doc-modal-empty">回收站是空的。</p>}</section></div>}
    {deleteTarget && <div className="doc-modal-backdrop doc-confirm-backdrop" onMouseDown={() => setDeleteTarget(null)}><section className="doc-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title" onMouseDown={(event) => event.stopPropagation()}><div className="doc-confirm-icon"><Trash2 size={20} /></div><div><h2 id="delete-confirm-title">移入回收站？</h2><p>将「{deleteTarget.title || "未命名文档"}」移入回收站后，仍可在回收站中恢复。</p></div><div className="doc-confirm-actions"><button onClick={() => setDeleteTarget(null)}>取消</button><button className="danger" onClick={() => void remove()}>移入回收站</button></div></section></div>}
  </div>;
}
