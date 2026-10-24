"use client";
import { ArrowDownLeft, ArrowUpRight, Link2, RotateCcw } from "lucide-react";
import type { DocumentKnowledge } from "@/hooks/use-document-knowledge";
import { studyStatusLabels, type StudyStatus } from "@/lib/knowledge-types";
import { documentHref } from "@/lib/document-links";

export function DocumentKnowledgePanel({ data, error, busy, onSelect, onRefresh, onStatusChange }: {
  data?: DocumentKnowledge; error?: string; busy: boolean; onSelect: (id: string) => void; onRefresh: () => void; onStatusChange: (status: StudyStatus | "off") => Promise<void>;
}) {
  const review = data?.review;
  const go = (event: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onSelect(targetId);
  };
  return <section className="doc-knowledge" aria-label="文档关联与复习">
    {review && <div className="doc-study-row"><div><RotateCcw size={16} /><span>主动复习</span><small>下次：{new Date(review.dueAt) <= new Date() ? "已到复习时间" : new Intl.DateTimeFormat("zh-CN", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" }).format(new Date(review.dueAt))}</small></div>
      <select aria-label="学习掌握程度" value={review.status} disabled={busy} onChange={(event) => void onStatusChange(event.target.value as StudyStatus | "off")}>{Object.entries(studyStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="off">暂不复习</option></select>
    </div>}
    {error && <p className="doc-knowledge-error" role="alert">{error}<button onClick={onRefresh}>重试</button></p>}
    {!data && !error && <p className="doc-knowledge-hint">正在加载文档关联…</p>}
    {data && <><div className="doc-links-heading"><Link2 size={16} /><h2>文档关联</h2><span>输入 [[ 搜索并引用文档</span></div><div className="doc-links-columns">
      <div><h3><ArrowUpRight size={14} />引用的文档 <span>{data.connections.outgoing.length}</span></h3>{data.connections.outgoing.length ? <ul>{data.connections.outgoing.map((reference) => <li key={reference.key}>{reference.target ? <a href={documentHref(reference.target.id)} onClick={(event) => go(event, reference.target!.id)}><span>{reference.target.icon || "📄"}</span>{reference.target.title}</a> : reference.candidates.length ? <div className="doc-unresolved-link"><span>[[{reference.title}]] · 存在同名文档</span>{reference.candidates.map((candidate) => <a key={candidate.id} href={documentHref(candidate.id)} onClick={(event) => go(event, candidate.id)}>{candidate.icon || "📄"} {candidate.title}<small>{candidate.parentId ? "子文档" : "顶级文档"} · {candidate.id.slice(0,6)}</small></a>)}</div> : <span className="doc-missing-link">[[{reference.title}]] <small>{reference.targetId ? "文档已删除或不可用" : "尚未找到同名文档"}</small></span>}</li>)}</ul> : <p>还没有引用其他文档。</p>}</div>
      <div><h3><ArrowDownLeft size={14} />被这些文档引用 <span>{data.connections.backlinks.length}</span></h3>{data.connections.backlinks.length ? <ul>{data.connections.backlinks.map((document) => <li key={document.id}><a href={documentHref(document.id)} onClick={(event) => go(event, document.id)}><span>{document.icon || "📄"}</span>{document.title}</a></li>)}</ul> : <p>有文档引用这里时，会自动出现在此处。</p>}</div>
    </div></>}
  </section>;
}
