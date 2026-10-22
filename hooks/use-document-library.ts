"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentSaveQueue } from "@/lib/document-save-queue";
import { documentSummary, type DocumentPatch, type DocumentRecord, type DocumentSummary } from "@/lib/document-types";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "操作失败");
  return response.json();
}

export function useDocumentLibrary(onLoaded: (items: DocumentSummary[]) => void) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ id: string; content: string } | null>(null);
  const [status, setStatus] = useState("正在载入");
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, string>());
  const discardedIds = useRef(new Set<string>());

  const [queue] = useState(() => new DocumentSaveQueue({
    request: async (id, patch, keepalive) => readJson<DocumentRecord>(await fetch(`/api/documents/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch), keepalive,
    })),
    storage: () => window.localStorage,
    onStatus: setStatus,
    onError: setError,
    onSaved: (id, saved, applied) => {
      const metadata = { ...applied };
      delete metadata.content;
      setDocuments((items) => items.map((item) => item.id === id ? { ...item, ...metadata, updatedAt: saved.updatedAt } : item));
    },
  }));

  const rememberDocument = useCallback((document: DocumentRecord) => {
    discardedIds.current.delete(document.id);
    cache.current.delete(document.id);
    cache.current.set(document.id, document.content);
    while (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value!);
    return documentSummary(document);
  }, []);

  const updateLocal = useCallback((id: string, patch: Partial<DocumentSummary>) => {
    setDocuments((items) => items.map((item) => item.id === id ? { ...item, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() } : item));
  }, []);

  const save = useCallback((id: string, patch: DocumentPatch) => {
    if (discardedIds.current.has(id)) return;
    if (patch.content !== undefined) cache.current.set(id, patch.content);
    const metadata = { ...patch };
    delete metadata.content;
    if (Object.keys(metadata).length) updateLocal(id, metadata);
    queue.enqueue(id, patch);
  }, [queue, updateLocal]);

  const loadDocuments = useCallback(async (signal?: AbortSignal) => {
    try {
      const items = await readJson<DocumentSummary[]>(await fetch("/api/documents", { signal }));
      if (signal?.aborted) return [];
      items.forEach((item) => discardedIds.current.delete(item.id));
      items.forEach((item) => queue.restore(item.id));
      setDocuments(items.map((item) => {
        const metadata = queue.getDraft(item.id);
        delete metadata.content;
        return { ...item, ...metadata };
      }));
      const saved = new URLSearchParams(window.location.search).get("document") || window.localStorage.getItem("knowledge-desk:selected");
      setSelectedId((current) => items.some((item) => item.id === current) ? current : items.find((item) => item.id === saved)?.id ?? items[0]?.id ?? null);
      setStatus(queue.hasPending ? "正在保存" : "已自动保存");
      onLoaded(items);
      return items;
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "文档库载入失败"); return []; }
  }, [queue, onLoaded]);

  const selected = useMemo(() => documents.find((item) => item.id === selectedId) ?? documents[0], [documents, selectedId]);
  const activeId = selected?.id;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return loadDocuments(controller.signal); });
    return () => controller.abort();
  }, [loadDocuments]);
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    const cached = cache.current.get(activeId);
    const content = queue.getDraft(activeId).content ?? cached;
    const request = content === undefined
      ? fetch(`/api/documents/${activeId}`, { signal: controller.signal }).then(readJson<DocumentRecord>).then((document) => {
        const latest = { ...document, content: queue.getDraft(activeId).content ?? document.content };
        rememberDocument(latest);
        return latest.content;
      })
      : Promise.resolve(content);
    void request.then((value) => {
      if (controller.signal.aborted) return;
      const latest = queue.getDraft(activeId).content ?? cache.current.get(activeId) ?? value;
      cache.current.delete(activeId);
      cache.current.set(activeId, latest);
      setOpened({ id: activeId, content: latest });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "正文载入失败");
    });
    return () => controller.abort();
  }, [activeId, queue, rememberDocument]);

  useEffect(() => {
    const flush = () => { void queue.flush(); };
    const onHidden = () => { if (document.hidden) flush(); };
    const onPageHide = () => { void queue.flush(undefined, true); };
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHidden);
      queue.pauseTimers();
      void queue.flush();
    };
  }, [queue]);

  const discardDocuments = useCallback((ids: string[]) => {
    ids.forEach((id) => { discardedIds.current.add(id); queue.discard(id); cache.current.delete(id); });
    setOpened((current) => current && ids.includes(current.id) ? null : current);
  }, [queue]);

  const selectDocument = useCallback((id: string | null) => {
    if (id === selectedId) return;
    setOpened(null);
    setSelectedId(id);
  }, [selectedId]);

  const flushSaves = useCallback(async () => {
    window.dispatchEvent(new Event("zhiyu:flush-editor"));
    return await queue.flush() && !queue.hasPending;
  }, [queue]);

  const applyServerDocument = useCallback((document: DocumentRecord) => {
    const summary = rememberDocument(document);
    setDocuments((items) => items.map((item) => item.id === document.id ? summary : item));
    setOpened({ id: document.id, content: document.content });
    setStatus("已恢复历史版本");
  }, [rememberDocument]);

  return { documents, setDocuments, selected, selectedId, setSelectedId: selectDocument, initialContent: opened && opened.id === activeId ? opened.content : null,
    status, setStatus, error, setError, loadDocuments, save, updateLocal, rememberDocument, discardDocuments, flushSaves, applyServerDocument };
}
