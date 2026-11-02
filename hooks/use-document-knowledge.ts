"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentConnections, ReviewPlan, StudyStatus } from "@/lib/knowledge-types";

export type DocumentKnowledge = { connections: DocumentConnections; review: ReviewPlan | null };
export function useDocumentKnowledge(id: string | undefined, savedAt: string | undefined, saveStatus: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ id: string; data?: DocumentKnowledge; error?: string } | null>(null);
  const [reviewUpdate, setReviewUpdate] = useState<{ id: string; busy: boolean; error?: string; failedStatus?: StudyStatus | "off" } | null>(null);
  const [reviews, setReviews] = useState<Record<string, { review?: ReviewPlan | null; error?: string }>>({});
  const pendingReviews = useRef(new Set<string>());
  const reviewEpochs = useRef(new Map<string, number>());
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const removeReviews = useCallback((ids: string[]) => {
    for (const id of ids) reviewEpochs.current.set(id, (reviewEpochs.current.get(id) ?? 0) + 1);
    setReviews((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, { review: null }])) }));
    refresh();
  }, [refresh]);
  const changeReviewStatus = useCallback(async (status: StudyStatus | "off") => {
    if (!id || pendingReviews.current.has(id)) return false;
    pendingReviews.current.add(id);
    reviewEpochs.current.set(id, (reviewEpochs.current.get(id) ?? 0) + 1);
    setReviewUpdate({ id, busy: true });
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || "更新复习计划失败。");
      setReviews((current) => ({ ...current, [id]: { review: result as ReviewPlan | null } }));
      setReviewUpdate({ id, busy: false });
      refresh();
      return true;
    } catch (cause) {
      setReviewUpdate({ id, busy: false, error: cause instanceof Error ? cause.message : "更新失败，请重试。", failedStatus: status });
      return false;
    } finally { pendingReviews.current.delete(id); }
  }, [id, refresh]);
  // Review enrollment is independent of link loading and ongoing editor saves.
  useEffect(() => {
    if (!id || pendingReviews.current.has(id)) return;
    const controller = new AbortController();
    const epoch = reviewEpochs.current.get(id) ?? 0;
    void fetch(`/api/documents/${encodeURIComponent(id)}/review`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const review = await response.json();
      if (!response.ok) throw new Error(review?.message || "复习状态加载失败。");
      if (!controller.signal.aborted && epoch === (reviewEpochs.current.get(id) ?? 0)) {
        setReviews((current) => ({ ...current, [id]: { review } }));
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && epoch === (reviewEpochs.current.get(id) ?? 0)) {
        setReviews((current) => ({ ...current, [id]: { ...current[id], error: cause instanceof Error ? cause.message : "复习状态加载失败。" } }));
      }
    });
    return () => controller.abort();
  }, [id, revision]);
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
    data: state && state.id === id && state.data ? { ...state.data, review: (id && reviews[id]?.review) || null } : undefined,
    review: id ? reviews[id]?.review : undefined,
    reviewLoading: Boolean(id && !reviews[id]),
    error: state && state.id === id ? state.error : undefined,
    reviewBusy: Boolean(reviewUpdate && reviewUpdate.id === id && reviewUpdate.busy),
    reviewError: (reviewUpdate && reviewUpdate.id === id ? reviewUpdate.error : undefined) || (id ? reviews[id]?.error : undefined),
    failedReviewStatus: reviewUpdate && reviewUpdate.id === id ? reviewUpdate.failedStatus : undefined,
    changeReviewStatus, refresh, removeReviews,
  };
}
