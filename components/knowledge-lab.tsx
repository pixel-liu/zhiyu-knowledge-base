"use client";

import {
  AlertTriangle, ArrowRight, CheckCircle2, FileClock, History,
  MessageCircleQuestion, Play, Search, Sparkles, Stethoscope,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { DocumentRecord, DocumentSummary } from "@/lib/document-types";
import type { DocumentVersion } from "@/lib/document-versions";
import { InterviewAnswer } from "@/components/interview-answer";
import type { InterviewQuestion, InterviewSession, KnowledgeAnswer, KnowledgeHealth, VersionSummary } from "@/lib/learning-types";
import type { KnowledgeTool } from "@/lib/workspace-navigation";

export type { KnowledgeTool } from "@/lib/workspace-navigation";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "操作失败，请重试。");
  return body as T;
}

function VersionBody({ content }: { content: string }) {
  const text = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(text).join("");
    if (!value || typeof value !== "object") return "";
    const item = value as { text?: string; content?: unknown; rows?: unknown; cells?: unknown };
    return `${item.text ?? ""}${text(item.content)}${text(item.rows)}${text(item.cells)}`;
  };
  let blocks: Array<{ type?: string; content?: unknown; children?: unknown }> | null = null;
  try { blocks = JSON.parse(content) as Array<{ type?: string; content?: unknown; children?: unknown }>; } catch { /* Keep the raw text fallback. */ }
  return <div className="lab-version-body">{blocks ? blocks.map((block, index) => <p className={block.type === "heading" ? "is-heading" : ""} key={index}>{text(block.content) || (block.type === "image" ? "[图片]" : "")}</p>) : <p>{content}</p>}</div>;
}

export function KnowledgeLab({ tool, documents, currentId, beforeOpen, onCurrentChange, onSelect, onRestore, onCreate }: {
  tool: KnowledgeTool;
  documents: DocumentSummary[];
  currentId: string | null;
  beforeOpen: () => Promise<boolean>;
  onCurrentChange: (id: string) => void;
  onSelect: (id: string, blockIndex?: number) => void;
  onRestore: (document: DocumentRecord) => void;
  onCreate: (document: DocumentRecord) => void;
}) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<KnowledgeAnswer | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState<InterviewQuestion | null>(null);
  const [interviewAnswer, setInterviewAnswer] = useState("");
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [interviewNotice, setInterviewNotice] = useState("");
  const [health, setHealth] = useState<KnowledgeHealth | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [activeVersion, setActiveVersion] = useState<DocumentVersion | null>(null);

  const current = useMemo(() => documents.find((item) => item.id === currentId) ?? null, [currentId, documents]);

  const loadHealth = useCallback(async (signal?: AbortSignal) => {
    setBusy(true); setError("");
    try {
      const result = await json<KnowledgeHealth>(await fetch("/api/learning?mode=health", { signal }));
      if (!signal?.aborted) setHealth(result);
    }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "知识体检失败。"); }
    finally { if (!signal?.aborted) setBusy(false); }
  }, []);

  const loadVersions = useCallback(async (signal?: AbortSignal) => {
    if (!currentId) { setVersions([]); setActiveVersion(null); setBusy(false); return; }
    setBusy(true); setError(""); setVersions([]); setActiveVersion(null);
    try {
      const result = await json<VersionSummary[]>(await fetch(`/api/documents/${encodeURIComponent(currentId)}/versions`, { signal }));
      if (!signal?.aborted) setVersions(result);
    }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "版本记录加载失败。"); }
    finally { if (!signal?.aborted) setBusy(false); }
  }, [currentId]);

  useEffect(() => {
    const controller = new AbortController();
    async function prepare() {
      try {
        const saved = await beforeOpen();
        if (controller.signal.aborted) return;
        setError("");
        if (!saved) { setError("文档尚未保存成功，请保存后再使用知识工具。"); setBusy(false); return; }
        if (currentId) setSelectedIds((items) => items.length ? items : [currentId]);
        if (tool === "health") await loadHealth(controller.signal);
        else if (tool === "versions") await loadVersions(controller.signal);
        else setBusy(false);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "知识工具加载失败。");
          setBusy(false);
        }
      }
    }
    void prepare();
    return () => controller.abort();
  }, [tool, currentId, beforeOpen, loadHealth, loadVersions]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2 || busy) return;
    setBusy(true); setError(""); setAnswer(null);
    try { setAnswer(await json<KnowledgeAnswer>(await fetch("/api/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ask", query }) }))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "知识问答失败。"); }
    finally { setBusy(false); }
  }

  async function startInterview() {
    if (!selectedIds.length || busy) return;
    setBusy(true); setError(""); setAnswerRevealed(false); setQuestions([]); setInterviewNotice("");
    try {
      const result = await json<InterviewSession>(await fetch("/api/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "interview-start", documentIds: selectedIds }) }));
      if (!result.questions.length) setError(result.notice || "所选文档没有足够的知识正文，请选择包含完整知识点的文档。");
      setQuestions(result.questions); setQuestionIndex(0); setActiveQuestion(result.questions[0] ?? null); setInterviewAnswer(""); setInterviewNotice(result.notice ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "面试题生成失败。"); }
    finally { setBusy(false); }
  }

  function submitInterview(event: FormEvent) {
    event.preventDefault();
    if (!activeQuestion || !interviewAnswer.trim() || answerRevealed) return;
    setAnswerRevealed(true);
  }

  function continueInterview() {
    const nextIndex = questionIndex + 1;
    setQuestionIndex(nextIndex); setActiveQuestion(questions[nextIndex] ?? null);
    setInterviewAnswer(""); setAnswerRevealed(false);
  }

  function openDocument(id: string, blockIndex?: number) { onSelect(id, blockIndex); }

  async function createAnswerNote() {
    if (!answer?.citations.length || busy) return;
    setBusy(true); setError("");
    const link = (citation: KnowledgeAnswer["citations"][number]) => ({ type: "link", href: `/?document=${encodeURIComponent(citation.documentId)}`, content: [{ type: "text", text: citation.documentTitle, styles: {} }] });
    const blocks = [
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "问题", styles: {} }] },
      { type: "paragraph", content: [{ type: "text", text: query.trim(), styles: {} }] },
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "根据笔记整理", styles: {} }] },
      ...answer.answer.split("\n").filter(Boolean).map((text) => ({ type: "paragraph", content: [{ type: "text", text: text.replace(/^\d+\.\s*/, ""), styles: {} }] })),
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "出处", styles: {} }] },
      ...answer.citations.map((citation) => ({ type: "bulletListItem", content: [link(citation), { type: "text", text: `${citation.heading ? ` · ${citation.heading}` : ""}：${citation.excerpt}`, styles: {} }] })),
    ];
    try {
      const title = `${query.trim().slice(0, 42)}${query.trim().length > 42 ? "…" : ""}｜知识问答`;
      const document = await json<DocumentRecord>(await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content: JSON.stringify(blocks) }) }));
      onCreate(document);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "整理为笔记失败。"); }
    finally { setBusy(false); }
  }

  async function openVersion(versionId: string) {
    if (!currentId || busy) return;
    setBusy(true); setError("");
    try { setActiveVersion(await json<DocumentVersion>(await fetch(`/api/documents/${encodeURIComponent(currentId)}/versions/${encodeURIComponent(versionId)}`))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "版本内容加载失败。"); }
    finally { setBusy(false); }
  }

  async function restoreVersion() {
    if (!currentId || !activeVersion || busy || !window.confirm("恢复这个版本？当前内容会先保留在版本时间轴中。")) return;
    setBusy(true); setError("");
    try {
      const restored = await json<DocumentRecord>(await fetch(`/api/documents/${encodeURIComponent(currentId)}/versions/${encodeURIComponent(activeVersion.id)}`, { method: "POST" }));
      onRestore(restored); await loadVersions();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "恢复版本失败。"); }
    finally { setBusy(false); }
  }

  const issueGroups = useMemo(() => health ? {
    attention: health.issues.filter((item) => item.severity === "attention"),
    suggestion: health.issues.filter((item) => item.severity === "suggestion"),
  } : null, [health]);

  return <section className="knowledge-tool-page">
        <div className="lab-content">
          {tool === "ask" && <div className="lab-panel"><div className="lab-panel-title"><div><h3>带出处的知识问答</h3><p>答案从现有笔记片段中组合，不连接外部模型。</p></div></div><form className="lab-ask-form" onSubmit={ask}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：项目里如何处理附件上传？" autoFocus /><button disabled={busy || query.trim().length < 2}>{busy ? "查找中…" : "查找答案"}</button></form>
            {answer ? <div className="lab-answer"><div className="lab-answer-note"><Sparkles size={17} /><span>{answer.citations.length ? `从 ${answer.matchedDocuments} 篇笔记中找到这些要点` : "没有找到匹配内容"}</span>{Boolean(answer.citations.length) && <button disabled={busy} onClick={() => void createAnswerNote()}>整理成新笔记</button>}</div><p className="lab-answer-text">{answer.answer}</p>{Boolean(answer.citations.length) && <div className="lab-citations"><h4>原文出处</h4>{answer.citations.map((item, index) => <button key={`${item.documentId}:${item.blockIndex}`} onClick={() => openDocument(item.documentId, item.blockIndex)}><span>{index + 1}</span><div><b>{item.icon || "📄"} {item.documentTitle}</b><small>{item.heading ? `${item.heading} · ` : ""}第 {item.blockIndex + 1} 个内容块</small><p>{item.excerpt}</p></div><ArrowRight size={15} /></button>)}</div>}</div> : <div className="lab-empty"><MessageCircleQuestion size={30} /><h4>问一条能在笔记中验证的问题</h4><p>关键词越具体，定位到的原文越准确。</p></div>}</div>}

          {tool === "interview" && <div className="lab-panel"><div className="lab-panel-title"><div><h3>基于笔记的模拟面试</h3><p>从文档知识点出题，作答后展示整理后的文档答案；有疑问时再主动追问。</p><p>启用模型后，出题会发送所选笔记片段；主动追问时会发送本题上下文和你的回答。</p></div>{activeQuestion && <button className="lab-text-button" onClick={() => { setActiveQuestion(null); setQuestions([]); setAnswerRevealed(false); setInterviewNotice(""); }}>重新选题</button>}</div>
            {!activeQuestion ? <>{questions.length === 0 ? <><div className="lab-document-picker">{documents.map((document) => <label key={document.id}><input type="checkbox" checked={selectedIds.includes(document.id)} onChange={() => setSelectedIds((items) => items.includes(document.id) ? items.filter((id) => id !== document.id) : items.length < 20 ? [...items, document.id] : items)} /><span>{document.icon || "📄"}</span><b>{document.title}</b></label>)}</div><div className="lab-start-row"><span>已选 {selectedIds.length} 篇，最多 20 篇</span><button className="lab-primary" disabled={busy || !selectedIds.length} onClick={() => void startInterview()}><Play size={16} />{busy ? "生成中…" : "开始模拟面试"}</button></div></> : <div className="lab-empty"><CheckCircle2 size={30} /><h4>本轮面试完成</h4><p>已完成 {questions.length} 道基础题，可以重新选择文档继续练习。</p><button className="lab-primary" onClick={() => { setQuestions([]); setQuestionIndex(0); setInterviewNotice(""); }}>重新选题</button></div>}</> : <div className="lab-interview">{interviewNotice && <div className="lab-answer-note"><Sparkles size={16} /><span>{interviewNotice}</span></div>}<div className="lab-question-meta"><span>第 {questionIndex + 1} / {questions.length} 题</span><span>{activeQuestion.documentTitle}</span><span>先作答，后看答案</span><span>{activeQuestion.engine === "ai" ? `AI 出题${activeQuestion.model ? ` · ${activeQuestion.model}` : ""}` : "本地出题"}</span></div><h4>{activeQuestion.prompt}</h4><form onSubmit={submitInterview}><textarea value={interviewAnswer} onChange={(event) => setInterviewAnswer(event.target.value)} aria-label="你的回答" placeholder="先按自己的理解作答，提交后即可查看参考答案和解析…" rows={7} maxLength={10000} disabled={answerRevealed} /><button className="lab-primary" disabled={busy || answerRevealed || !interviewAnswer.trim()}>{answerRevealed ? "已提交回答" : "提交并查看答案"}</button></form>{answerRevealed && <InterviewAnswer key={activeQuestion.id} question={activeQuestion} userAnswer={interviewAnswer} hasNext={Boolean(questions[questionIndex + 1])} onNext={continueInterview} onOpenSource={() => openDocument(activeQuestion.documentId, activeQuestion.blockIndex)} />}</div>}
          </div>}

          {tool === "health" && <div className="lab-panel"><div className="lab-panel-title"><div><h3>知识体检</h3><p>{health ? `已扫描 ${health.documents} 篇文档` : "扫描链接、标题和长期未整理的草稿。"}</p></div><button className="lab-text-button" disabled={busy} onClick={() => void loadHealth()}>重新扫描</button></div>{busy && !health ? <div className="lab-empty"><Stethoscope size={30} /><p>正在检查文档关系…</p></div> : health && !health.issues.length ? <div className="lab-empty"><CheckCircle2 size={30} /><h4>知识库状态很好</h4><p>没有发现失效链接、重复标题或长期未整理的草稿。</p></div> : issueGroups && <div className="lab-health"><div className="lab-health-summary"><span><strong>{issueGroups.attention.length}</strong> 项需要处理</span><span><strong>{issueGroups.suggestion.length}</strong> 项整理建议</span></div>{health!.issues.map((issue) => <button key={issue.id} onClick={() => openDocument(issue.documentId)}><span className={`lab-issue-icon is-${issue.severity}`}>{issue.severity === "attention" ? <AlertTriangle size={16} /> : <FileClock size={16} />}</span><div><b>{issue.title}</b><p>{issue.detail}</p><small>{issue.documentTitle}</small></div><ArrowRight size={15} /></button>)}</div>}</div>}

          {tool === "versions" && <div className="lab-panel"><div className="lab-panel-title"><div><h3>文档版本时间轴</h3><p>选择文档，查看保存记录并恢复历史内容。</p></div>{current && <button className="lab-text-button" disabled={busy} onClick={() => void loadVersions()}>刷新</button>}</div><label className="lab-version-document"><span>选择文档</span><select aria-label="选择版本文档" value={currentId ?? ""} disabled={busy || !documents.length} onChange={(event) => { setBusy(true); setVersions([]); setActiveVersion(null); onCurrentChange(event.target.value); }}><option value="" disabled>请选择文档</option>{documents.map((document) => <option value={document.id} key={document.id}>{document.title || "未命名文档"}</option>)}</select></label>{!current ? <div className="lab-empty"><History size={30} /><p>选择一篇文档后即可查看版本。</p></div> : <div className="lab-versions"><ol>{versions.map((version, index) => <li key={version.id}><i /><button disabled={busy} className={activeVersion?.id === version.id ? "is-active" : ""} onClick={() => void openVersion(version.id)}><span>{index === 0 ? "最新保存" : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(version.createdAt))}</span><b>{version.title}</b><p>{version.preview}</p><small>{version.characterCount} 个字符</small></button></li>)}</ol><div className="lab-version-preview">{activeVersion ? <><div><span><History size={15} />{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(activeVersion.createdAt))}</span><button disabled={busy || activeVersion.id === versions[0]?.id} onClick={() => void restoreVersion()}>恢复这个版本</button></div><h4>{activeVersion.title}</h4><VersionBody content={activeVersion.content} /></> : <div className="lab-empty"><History size={28} /><p>{busy ? "正在加载版本记录…" : versions.length ? "从左侧选择一个版本查看内容。" : "保存后的版本会出现在这里。"}</p></div>}</div></div>}</div>}
          {error && <p className="lab-error" role="alert">{error}</p>}
        </div>
  </section>;
}
