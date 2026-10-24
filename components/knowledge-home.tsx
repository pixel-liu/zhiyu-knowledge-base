"use client";

import { ArrowRight, BookOpen, BrainCircuit, FileText, History, MessageCircleQuestion, Stethoscope } from "lucide-react";
import type { MouseEvent } from "react";
import type { DocumentSummary } from "@/lib/document-types";
import "./knowledge-home.css";

const tools = [
  { href: "/tools/ask", title: "知识问答", description: "从笔记中查找答案，回到原文出处。", icon: MessageCircleQuestion },
  { href: "/tools/interview", title: "模拟面试", description: "围绕笔记练习作答，在追问中查漏补缺。", icon: BrainCircuit },
  { href: "/tools/health", title: "知识体检", description: "发现待整理的内容，让知识库更清晰。", icon: Stethoscope },
  { href: "/tools/versions", title: "版本时间轴", description: "查看文档的修改记录，找回需要的版本。", icon: History },
];

export type KnowledgeHomeProps = {
  documents: DocumentSummary[];
  loaded?: boolean;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
};

function updatedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" });
}

export function KnowledgeHome({ documents, loaded = false, onNavigate }: KnowledgeHomeProps) {
  const activeDocuments = documents.filter((document) => !document.isDeleted);
  const recentDocuments = [...activeDocuments]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3);

  return (
    <main className="knowledge-home">
      <header className="knowledge-home-intro">
        <h1>我的知识空间</h1>
        <p>记录、整理，再多理解一点。</p>
      </header>

      <a className="knowledge-home-library" href="/documents" onClick={(event) => onNavigate(event, "/documents")}>
        <span className="knowledge-home-library-icon"><BookOpen size={27} strokeWidth={1.65} aria-hidden="true" /></span>
        <span className="knowledge-home-library-content">
          <span className="knowledge-home-library-title">我的知识库</span>
          <span className="knowledge-home-library-description">整理笔记，连接想法，继续上次的记录。</span>
          {loaded && <span className="knowledge-home-library-count">{activeDocuments.length} 篇文档</span>}
        </span>
        <span className="knowledge-home-library-action">进入知识库 <ArrowRight size={17} aria-hidden="true" /></span>
      </a>

      <section className="knowledge-home-section" aria-labelledby="knowledge-home-tools-title">
        <div className="knowledge-home-section-heading">
          <h2 id="knowledge-home-tools-title">知识工具</h2>
          <p>让已有的笔记，发挥更多作用。</p>
        </div>
        <nav className="knowledge-home-tools" aria-label="知识工具">
          {tools.map(({ href, title, description, icon: Icon }) => (
            <a className="knowledge-home-tool" key={href} href={href} onClick={(event) => onNavigate(event, href)}>
              <Icon className="knowledge-home-tool-icon" size={23} strokeWidth={1.65} aria-hidden="true" />
              <span className="knowledge-home-tool-content">
                <span className="knowledge-home-tool-title">{title}</span>
                <span className="knowledge-home-tool-description">{description}</span>
              </span>
              <ArrowRight className="knowledge-home-tool-arrow" size={17} aria-hidden="true" />
            </a>
          ))}
        </nav>
      </section>

      {loaded && recentDocuments.length > 0 && (
        <section className="knowledge-home-section knowledge-home-recent" aria-labelledby="knowledge-home-recent-title">
          <div className="knowledge-home-section-heading">
            <h2 id="knowledge-home-recent-title">最近编辑</h2>
            <a href="/documents" onClick={(event) => onNavigate(event, "/documents")}>查看全部</a>
          </div>
          <ul className="knowledge-home-document-list">
            {recentDocuments.map((document) => {
              const href = `/documents?document=${encodeURIComponent(document.id)}`;
              return (
                <li key={document.id}>
                  <a className="knowledge-home-document" href={href} onClick={(event) => onNavigate(event, href)}>
                    <span className="knowledge-home-document-icon" aria-hidden="true">{document.icon || <FileText size={17} strokeWidth={1.6} />}</span>
                    <span className="knowledge-home-document-title">{document.title || "未命名文档"}</span>
                    <time dateTime={document.updatedAt}>{updatedDate(document.updatedAt)}</time>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
