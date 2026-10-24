"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentConnections, ReviewPlan, StudyStatus } from "@/lib/knowledge-types";

export type DocumentKnowledge = { connections: DocumentConnections; review: ReviewPlan | null };
export function useDocumentKnowledge(id: string | undefined, savedAt: string | undefined, saveStatus: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ id: string; data?: DocumentKnowledge; error?: string } | null>(null);
  const [reviewUpdate, setReviewUpdate] = useState<{ id: string; busy: boolean; error?: string; failedStatus?: StudyStatus | "off" } | null>(null);
  const pendingReviews = useRef(new Set<string>());
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const changeReviewStatus = useCallback(async (status: StudyStatus | "off") => {
    if (!id || pendingReviews.current.has(id)) return false;
    pendingReviews.current.add(id);
    setReviewUpdate({ id, busy: true });
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || "更新复习计划失败。");
      setState((current) => current?.id === id && current.data
        ? { ...current, data: { ...current.data, review: result as ReviewPlan | null } }
        : current);
      setReviewUpdate({ id, busy: false });
      refresh();
      return true;
    } catch (cause) {
      setReviewUpdate({ id, busy: false, error: cause instanceof Error ? cause.message : "更新失败，请重试。", failedStatus: status });
      return false;
    } finally { pendingReviews.current.delete(id); }
  }, [id, refresh]);
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
  return {
    data: state && state.id === id ? state.data : undefined,
    error: state && state.id === id ? state.error : undefined,
    reviewBusy: Boolean(reviewUpdate && reviewUpdate.id === id && reviewUpdate.busy),
    reviewError: reviewUpdate && reviewUpdate.id === id ? reviewUpdate.error : undefined,
    failedReviewStatus: reviewUpdate && reviewUpdate.id === id ? reviewUpdate.failedStatus : undefined,
    changeReviewStatus, refresh,
  };
}
