"use client";

import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import { FormEvent, useId, useState } from "react";
import type { InterviewFollowUp, InterviewFollowUpTurn, InterviewQuestion } from "@/lib/learning-types";

export function InterviewAnswer({ question, userAnswer, hasNext, onNext, onOpenSource }: {
  question: InterviewQuestion;
  userAnswer: string;
  hasNext: boolean;
  onNext: () => void;
  onOpenSource: () => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<InterviewFollowUpTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function followUp(event: FormEvent) {
    event.preventDefault();
    const query = draft.trim();
    if (!query || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/learning", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "interview-follow-up", question, answer: userAnswer, query, history: turns.slice(-8) }),
      });
      const result = await response.json().catch(() => null) as (InterviewFollowUp & { message?: string }) | null;
      if (!response.ok || !result?.answer) throw new Error(result?.message || result?.notice || "追问暂时无法完成，请重试。");
      setTurns((items) => [...items, { question: query, answer: result.answer }]);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "追问暂时无法完成，请重试。");
    } finally { setBusy(false); }
  }

  return <section className="lab-feedback" aria-label="参考答案和追问">
    <div className="lab-question-meta"><span>答案来自文档原文</span></div>
    <h5>文档答案</h5>
    <p className="lab-reference-text">{question.referenceAnswer || question.source}</p>
    {question.explanation && <><h5>答题解析</h5><p className="lab-reference-text">{question.explanation}</p></>}
    {Boolean(question.keywords.length) && <div className="lab-reference-points"><b>核对要点</b><ul>{question.keywords.map((point) => <li key={point}>{point}</li>)}</ul></div>}
    <details className="lab-reference-source"><summary>笔记原文与出处</summary><blockquote><span>{question.documentTitle}{question.heading ? ` · ${question.heading}` : ""}</span>{question.source}</blockquote><button type="button" className="lab-text-button" onClick={onOpenSource}>打开笔记原文</button></details>
    <div className="lab-follow-up">
      <div className="lab-follow-up-heading"><MessageCircleQuestion size={17} /><label htmlFor={inputId}>还有疑问？继续追问</label></div>
      <p>针对这道题提问，发送后由 AI 结合笔记解答。</p>
      <div className="lab-follow-up-history" aria-live="polite">{turns.map((turn, index) => <div className="lab-follow-up-turn" key={index}><b>你的追问</b><p>{turn.question}</p><b>AI 解答</b><p>{turn.answer}</p></div>)}</div>
      <form onSubmit={followUp} aria-label="针对本题追问">
        <textarea id={inputId} value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={1000} disabled={busy} placeholder="例如：为什么需要这样设计？我的回答漏掉了什么？" />
        <button className="lab-primary" disabled={busy || !draft.trim()}>{busy ? "正在解答…" : "发送追问"}</button>
      </form>
      {error && <p className="lab-error" role="alert">{error}</p>}
    </div>
    <div className="lab-feedback-actions"><button type="button" className="lab-primary" disabled={busy} onClick={onNext}>{hasNext ? "下一题" : "完成本轮"}<ArrowRight size={15} /></button></div>
  </section>;
}
