"use client";
import { BookOpen, Check, ChevronLeft, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { studyStatusLabels, type ReviewGrade, type ReviewItem, type ReviewOverview } from "@/lib/knowledge-types";
import type { DocumentRecord } from "@/lib/document-types";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "操作失败，请重试。");
  return body;
}

// Render only text from saved blocks. Review mode never runs raw HTML or leaks the answer before reveal.
function ReviewAnswer({ content }: { content: string }) {
  const text = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(text).join("");
    if (!value || typeof value !== "object") return "";
    const item = value as { text?: string; content?: unknown; rows?: unknown; cells?: unknown };
    return (typeof item.text === "string" ? item.text : "") + text(item.content) + text(item.rows) + text(item.cells);
  };
  const blocks = (items: unknown[]): React.ReactNode[] => items.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const block = value as { type?: string; content?: unknown; children?: unknown[]; props?: { caption?: string } };
    const body = text(block.content);
    return [<div key={index} className={`review-answer-block ${block.type === "heading" ? "is-heading" : block.type === "codeBlock" ? "is-code" : ""}`}>{body || (block.type === "image" ? `[图片] ${block.props?.caption || ""}` : "")}{block.children && <div className="review-answer-children">{blocks(block.children)}</div>}</div>];
  });
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { parsed = content; }
  return <div className="review-answer">{Array.isArray(parsed) ? blocks(parsed) : text(parsed)}</div>;
}

function ReviewSession({ item, onBack, onGraded, onOpen }: { item: ReviewItem; onBack: () => void; onGraded: () => void; onOpen: (id: string) => void }) {
  const [answer, setAnswer] = useState<DocumentRecord | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function reveal() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    const request = new AbortController(); controller.current = request;
    try {
      const document = await json<DocumentRecord>(await fetch(`/api/documents/${encodeURIComponent(item.id)}`, { signal: request.signal }));
      if (!request.signal.aborted) { setAnswer(document); setRevealed(true); }
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "正文加载失败。"); }
    finally { if (!request.signal.aborted) { setBusy(false); sending.current = false; } }
  }
  async function grade(value: ReviewGrade) {
    if (sending.current || !revealed) return;
    sending.current = true; setBusy(true); setError("");
    try {
      await json(await fetch(`/api/documents/${encodeURIComponent(item.id)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grade: value, version: item.review.version }),
      }));
      onGraded();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存复习结果失败。"); setBusy(false); sending.current = false; }
  }
  return <div className="review-session"><button className="review-back" disabled={busy} onClick={onBack}><ChevronLeft size={16} />返回清单</button><span className={`review-status is-${item.review.status}`}>{studyStatusLabels[item.review.status]}</span><h3>{item.icon || "📄"} {item.title}</h3>
    {!revealed ? <div className="review-recall"><BookOpen size={32} strokeWidth={1.4} /><p>先回忆一下：这篇笔记的核心内容是什么？</p><span>试着说出关键概念、原理和一个例子，再查看正文。</span><button className="review-primary" disabled={busy} onClick={() => void reveal()}>{busy ? "加载中…" : "展开正文，对照回忆"}</button></div> : <>{answer && <ReviewAnswer content={answer.content} />}<p className="review-grade-label">这次回忆得怎么样？</p><div className="review-grades"><button disabled={busy} onClick={() => void grade("again")}><b>没想起来</b><small>10 分钟后再看</small></button><button disabled={busy} onClick={() => void grade("hard")}><b>有些模糊</b><small>明天再巩固</small></button><button disabled={busy} onClick={() => void grade("good")}><b>基本记得</b><small>逐步延长间隔</small></button><button disabled={busy} onClick={() => void grade("easy")}><b>很熟悉</b><small>安排更久以后</small></button></div><button className="review-open-note" disabled={busy} onClick={() => onOpen(item.id)}>打开原文档</button></>}
    {error && <p className="doc-knowledge-error" role="alert">{error}</p>}
  </div>;
}

export function ReviewCenter({ revision, onSelect, onChanged, beforeOpen }: { revision: number; onSelect: (id: string) => void; onChanged: () => void; beforeOpen: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<ReviewOverview | null>(null);
  const [active, setActive] = useState<ReviewItem | null>(null);
  const [filter, setFilter] = useState<"due" | "all">("due");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await json<ReviewOverview>(await fetch("/api/reviews", { signal }));
      if (!signal?.aborted) { setOverview(result); setClock(Date.now()); setError(""); }
    } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "复习清单加载失败。"); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return reload(controller.signal); });
    const timer = window.setInterval(() => { if (!document.hidden) void reload(controller.signal); }, 60000);
    const onVisible = () => { if (!document.hidden) void reload(controller.signal); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [reload, revision]);
  async function show() {
    if (loading) return;
    setLoading(true);
    if (!await beforeOpen()) { setError("文档尚未保存成功，请稍后再打开复习。"); setLoading(false); return; }
    setActive(null); setNotice(""); setOpen(true);
    await reload(); setLoading(false);
  }
  const items = overview?.items.filter((item) => filter === "all" || new Date(item.review.dueAt).getTime() <= clock) ?? [];
  const openNote = (id: string) => { setOpen(false); setActive(null); onSelect(id); };
  return <><button type="button" className="doc-review-trigger" title="今日复习" aria-label={`今日复习${overview?.due ? `，${overview.due} 篇待复习` : ""}`} disabled={loading} onClick={() => void show()}><RotateCcw size={18} />{Boolean(overview?.due) && <span>{overview!.due}</span>}</button>
    {!open && error && <span className="doc-logout-error" role="alert">{error}<button onClick={() => void show()}>重试</button></span>}
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setActive(null); }}><DialogContent className="review-dialog"><div className="review-heading"><div><DialogTitle>今日复习</DialogTitle><DialogDescription>给知识一点回想的时间。</DialogDescription></div><span><Check size={14} />今日已复习 {overview?.reviewedToday ?? 0} 篇</span></div>
      {active ? <ReviewSession key={`${active.id}:${active.review.version}`} item={active} onBack={() => { setActive(null); void reload(); }} onOpen={openNote} onGraded={() => { setActive(null); setNotice("已记录，下一次复习已安排。"); void reload(); onChanged(); }} /> : <><div className="review-tabs"><button aria-pressed={filter === "due"} onClick={() => setFilter("due")}>待复习 <span>{overview?.due ?? 0}</span></button><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>全部计划 <span>{overview?.total ?? 0}</span></button></div>{notice && <p className="review-notice" role="status">{notice}</p>}{error ? <p className="doc-knowledge-error" role="alert">{error}<button onClick={() => void reload()}>重试</button></p> : !overview ? <p className="review-empty">正在加载复习清单…</p> : items.length ? <ul className="review-list">{items.map((item) => <li key={item.id}><span>{item.icon || "📄"}</span><div><b>{item.title}</b><small><span className={`review-status is-${item.review.status}`}>{studyStatusLabels[item.review.status]}</span>{new Date(item.review.dueAt).getTime() <= clock ? "已到复习时间" : `下次 ${new Intl.DateTimeFormat("zh-CN", { month:"numeric", day:"numeric" }).format(new Date(item.review.dueAt))}`} · 已复习 {item.review.reviewCount} 次</small></div><button onClick={() => { setNotice(""); setActive(item); }}>开始回忆</button></li>)}</ul> : <div className="review-empty"><Check size={28} /><h3>{overview.total ? "当前复习已完成" : "从一篇笔记开始"}</h3><p>{overview.total ? "到期的文档会自动出现在这里，也可以在全部计划中提前复习。" : "在文档标题右侧点击“加入复习”，就能开始安排复习计划。"}</p></div>}</>}
    </DialogContent></Dialog>
  </>;
}
