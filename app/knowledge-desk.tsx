"use client";

import { BookOpen, Download, FilePlus2, LockKeyhole, Search, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Note = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
  isPublic: boolean;
  group: string;
};

const seedNotes: Note[] = [
  {
    id: "capture-method",
    title: "建立一个不会失效的知识捕捉系统",
    content: "知识不是越收集越好，而是要在需要时能被重新找到。\n\n我的原则：先记录来源，再写下自己的判断；把还没有消化的内容放进收集箱；每周给重要的笔记补一个可检索的标题和标签。\n\n当一条笔记准备分享时，补充背景、结论和适用边界，然后再发布。",
    tags: ["知识管理", "方法"],
    updatedAt: "今天 10:32",
    isPublic: false,
    group: "知识管理",
  },
  {
    id: "learning-loop",
    title: "学习闭环：输入、连接、输出",
    content: "一个可持续的学习系统，不只需要阅读，还需要把新知识与旧经验连接，并通过写作或实践完成输出。",
    tags: ["学习", "写作"],
    updatedAt: "昨天",
    isPublic: true,
    group: "知识管理",
  },
  {
    id: "weekly-review",
    title: "每周回顾清单",
    content: "回顾本周输入，归档已完成的项目，标记值得继续研究的问题。",
    tags: ["复盘"],
    updatedAt: "9 月 12 日",
    isPublic: false,
    group: "生活系统",
  },
];

const storageKey = "zhiyu-local-notes-v1";

export function KnowledgeDesk() {
  const [notes, setNotes] = useState<Note[]>(seedNotes);
  const [selectedId, setSelectedId] = useState(seedNotes[0].id);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Note[];
        if (Array.isArray(parsed) && parsed.length) {
          setNotes(parsed);
          setSelectedId(parsed[0].id);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(storageKey, JSON.stringify(notes));
  }, [notes, ready]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const current = notes.find((note) => note.id === selectedId) ?? notes[0];
  const filteredNotes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return notes;
    return notes.filter((note) => `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(keyword));
  }, [notes, query]);
  const publicCount = notes.filter((note) => note.isPublic).length;

  const updateCurrent = (patch: Partial<Note>) => {
    setNotes((items) => items.map((item) => item.id === current.id ? { ...item, ...patch, updatedAt: "刚刚" } : item));
  };

  const createNote = () => {
    const note: Note = {
      id: `note-${Date.now()}`,
      title: "未命名笔记",
      content: "从这里开始记录。\n\n写下你刚刚学到的内容、自己的理解，或下一步要验证的问题。",
      tags: ["收集箱"],
      updatedAt: "刚刚",
      isPublic: false,
      group: "收集箱",
    };
    setNotes((items) => [note, ...items]);
    setSelectedId(note.id);
  };

  if (!current) return null;

  return (
    <div className="zhiyu-shell">
      <aside className="zhiyu-sidebar" aria-label="知识库导航">
        <div className="zhiyu-brand">
          <div className="zhiyu-mark">知</div>
          <div><strong>知屿</strong><span>个人知识库</span></div>
        </div>
        <button className="zhiyu-create" onClick={createNote}><FilePlus2 size={17} /> 新建笔记</button>
        <div className="zhiyu-search"><Search size={15} /> 快速查找 <kbd>Ctrl K</kbd></div>
        <div className="zhiyu-space-label">我的空间</div>
        <nav className="zhiyu-tree">
          {notes.map((note) => (
            <button key={note.id} className={`zhiyu-tree-item ${note.id === current.id ? "active" : ""}`} onClick={() => setSelectedId(note.id)}>
              <BookOpen size={15} /> {note.title} {note.isPublic && <small>公开</small>}
            </button>
          ))}
        </nav>
        <div className="zhiyu-sidebar-footer"><b>本机知识库</b><br />笔记会保存在当前浏览器；连接云端后可跨设备同步和公开分享。</div>
      </aside>

      <main className="zhiyu-main">
        <header className="zhiyu-topbar">
          <div className="zhiyu-crumb">我的空间 / <strong>{current.group}</strong></div>
          <div className="zhiyu-top-actions">
            <span className="zhiyu-live"><i /> 已自动保存</span>
            <button className="zhiyu-export" onClick={() => navigator.clipboard?.writeText(current.content)}><Download size={14} /> 复制内容</button>
          </div>
        </header>

        <div className="zhiyu-workspace">
          <section className="zhiyu-overview">
            <div><div className="zhiyu-eyebrow">KNOWLEDGE, MADE USEFUL</div><h1>把零散输入，<br />沉淀成你的判断。</h1></div>
            <p>先在私密空间里写清楚，再选择值得被人看见的内容。每条笔记都可以成为将来公开分享的一篇文章。</p>
          </section>

          <section className="zhiyu-stats" aria-label="知识库概览">
            <div className="zhiyu-stat"><span>全部笔记</span><b>{notes.length} 篇</b></div>
            <div className="zhiyu-stat"><span>已公开</span><b>{publicCount} 篇</b></div>
            <div className="zhiyu-stat"><span>本周新增</span><b>{notes.filter((note) => note.updatedAt === "刚刚" || note.updatedAt.includes("今天")).length} 篇</b></div>
          </section>

          <section className="zhiyu-grid">
            <article className="zhiyu-editor-card">
              <div className="zhiyu-editor-head"><LockKeyhole size={15} /><span>{current.isPublic ? "已发布到公开知识库" : "仅自己可见"}</span><button className={`zhiyu-chip ${current.isPublic ? "public" : "private"}`} onClick={() => updateCurrent({ isPublic: !current.isPublic })}>{current.isPublic ? "已公开 · 点击设为私密" : "设为公开"}</button></div>
              <div className="zhiyu-editor">
                <input className="zhiyu-title-input" value={current.title} onChange={(event) => updateCurrent({ title: event.target.value })} aria-label="笔记标题" />
                <div className="zhiyu-meta"><span>{current.updatedAt} 更新</span>{current.tags.map((tag) => <span className="zhiyu-tag" key={tag}>#{tag}</span>)}</div>
                <textarea value={current.content} onChange={(event) => updateCurrent({ content: event.target.value })} aria-label="笔记内容" />
                <div className="zhiyu-editor-foot"><span>{current.content.length} 个字</span><span>{current.isPublic ? "公开页将使用这份内容" : "完成后可一键公开"}</span></div>
              </div>
            </article>

            <aside>
              <section className="zhiyu-panel">
                <div className="zhiyu-panel-head"><h2>继续整理</h2><button onClick={() => setQuery("")}>清除筛选</button></div>
                <input ref={searchRef} className="zhiyu-find" placeholder="搜索标题、内容或标签" value={query} onChange={(event) => setQuery(event.target.value)} />
                <div className="zhiyu-note-list">
                  {filteredNotes.map((note) => <button key={note.id} className={`zhiyu-note ${note.id === current.id ? "active" : ""}`} onClick={() => setSelectedId(note.id)}><b>{note.title}</b>{note.isPublic && <i>公开</i>}<span>{note.tags.join(" · ")} · {note.updatedAt}</span></button>)}
                </div>
              </section>
              <section className="zhiyu-publish"><h2>准备分享？</h2><p>先补充读者需要的背景和结论，再把这条笔记设为公开。下一阶段接入云端后，它会生成独立的知识文章链接。</p><button onClick={() => updateCurrent({ isPublic: !current.isPublic })}><Share2 size={13} /> {current.isPublic ? "收回公开" : "将此笔记设为公开"}</button></section>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}
