"use client";
import { useCallback, useEffect, useState } from "react";
import type { DocumentConnections, ReviewPlan } from "@/lib/knowledge-types";

export type DocumentKnowledge = { connections: DocumentConnections; review: ReviewPlan | null };
export function useDocumentKnowledge(id: string | undefined, savedAt: string | undefined, saveStatus: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ id: string; data?: DocumentKnowledge; error?: string } | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!id || saveStatus === "正在保存") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/documents/${encodeURIComponent(id)}/knowledge`, { signal: controller.signal }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "关联信息加载失败。");
        if (!controller.signal.aborted) setState({ id, data });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ id, error: error instanceof Error ? error.message : "关联信息加载失败。" });
      });
    }, 200);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [id, savedAt, saveStatus, revision]);
  return { data: state && state.id === id ? state.data : undefined, error: state && state.id === id ? state.error : undefined, refresh };
}
