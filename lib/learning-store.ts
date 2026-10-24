import { getDocument, getDatabase, listDocuments } from "./documents-db";
import { getDocumentVersion, listDocumentVersions } from "./document-versions";
import { interviewMaterials, interviewPrompt } from "./interview-material";
import type { HealthIssue, InterviewFeedback, InterviewQuestion, KnowledgeAnswer, KnowledgeCitation, KnowledgeHealth, VersionSummary } from "./learning-types";

type Block = { type?: string; props?: { level?: number }; content?: unknown; children?: Block[] };
type Chunk = { documentId: string; documentTitle: string; icon: string | null; blockIndex: number; heading: string | null; text: string; isHeading: boolean };

const stopWords = new Set(["的", "了", "和", "是", "在", "与", "及", "或", "这", "那", "一个", "如何", "什么", "为什么", "怎么", "哪些", "进行", "使用", "the", "and", "for", "with", "from", "that", "this", "what", "how"]);

function inlineText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(inlineText).join("");
  if (value && typeof value === "object") {
    const item = value as { text?: unknown; content?: unknown; rows?: unknown; cells?: unknown };
    return `${typeof item.text === "string" ? item.text : ""}${inlineText(item.content)}${inlineText(item.rows)}${inlineText(item.cells)}`;
  }
  return "";
}

function chunksFor(document: ReturnType<typeof getDocument> extends infer T ? Exclude<T, null> : never): Chunk[] {
  let blocks: Block[] = [];
  try { blocks = JSON.parse(document.content) as Block[]; } catch { return document.plainText ? [{ documentId: document.id, documentTitle: document.title, icon: document.icon, blockIndex: 0, heading: null, text: document.plainText, isHeading: false }] : []; }
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let index = 0;
  const visit = (items: Block[]) => {
    for (const block of items) {
      const text = inlineText(block.content).replace(/\s+/g, " ").trim();
      if (block.type === "heading" && text) heading = text;
      if (text && block.type !== "codeBlock") chunks.push({ documentId: document.id, documentTitle: document.title, icon: document.icon, blockIndex: index, heading, text, isHeading: block.type === "heading" });
      index += 1;
      if (Array.isArray(block.children)) visit(block.children);
    }
  };
  visit(blocks);
  return chunks;
}

export function tokenize(value: string) {
  const normalized = value.toLocaleLowerCase("zh-CN");
  const words: string[] = [];
  try {
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    for (const segment of segmenter.segment(normalized)) if (segment.isWordLike) words.push(segment.segment);
  } catch {
    words.push(...normalized.match(/[\p{L}\p{N}]+/gu) ?? []);
  }
  const expanded = words.flatMap((word) => word.length >= 4 && /^[\u3400-\u9fff]+$/u.test(word)
    ? [word, ...Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2))]
    : [word]);
  return [...new Set(expanded.filter((word) => word.length > 1 && !stopWords.has(word)))];
}

const excerpt = (value: string, limit = 220) => value.length > limit ? `${value.slice(0, limit).trim()}…` : value;

export function answerFromNotes(query: string): KnowledgeAnswer {
  const terms = tokenize(query);
  if (!terms.length) return { answer: "请再具体描述想查找的概念或问题。", citations: [], matchedDocuments: 0 };
  const normalizedQuery = query.toLocaleLowerCase("zh-CN");
  const candidates = listDocuments(false).flatMap((document) => chunksFor(document).map((chunk) => {
    const body = `${chunk.heading ?? ""} ${chunk.text}`.toLocaleLowerCase("zh-CN");
    const title = chunk.documentTitle.toLocaleLowerCase("zh-CN");
    const overlap = terms.filter((term) => body.includes(term));
    const score = overlap.length * 4 + terms.filter((term) => title.includes(term)).length * 3 + (body.includes(normalizedQuery) ? 10 : 0);
    return { chunk, score };
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.blockIndex - b.chunk.blockIndex);
  const ranked = candidates.some((item) => !item.chunk.isHeading) ? candidates.filter((item) => !item.chunk.isHeading) : candidates;
  const seen = new Set<string>();
  const citations: KnowledgeCitation[] = [];
  for (const item of ranked) {
    const key = `${item.chunk.documentId}:${item.chunk.blockIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ documentId: item.chunk.documentId, documentTitle: item.chunk.documentTitle, icon: item.chunk.icon,
      blockIndex: item.chunk.blockIndex, heading: item.chunk.heading, excerpt: excerpt(item.chunk.text), score: item.score });
    if (citations.length === 4) break;
  }
  if (!citations.length) return { answer: "当前笔记中没有找到足够相关的内容。可以换一个关键词，或先补充这部分笔记。", citations: [], matchedDocuments: 0 };
  const answer = citations.slice(0, 3).map((item, index) => `${index + 1}. ${item.excerpt}`).join("\n");
  return { answer, citations, matchedDocuments: new Set(citations.map((item) => item.documentId)).size };
}

function questionKeywords(chunk: { heading: string | null; text: string }) {
  const frequency = new Map<string, number>();
  for (const word of tokenize(`${chunk.heading ?? ""} ${chunk.text}`)) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  return [...frequency.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 8).map(([word]) => word);
}

export function buildInterview(documentIds: string[]): InterviewQuestion[] {
  const wanted = new Set(documentIds);
  const questions: InterviewQuestion[] = [];
  const pools: InterviewQuestion[][] = [];
  for (const document of listDocuments(false).filter((item) => wanted.has(item.id))) {
    const pool: InterviewQuestion[] = [];
    for (const chunk of interviewMaterials(document.content, document.plainText)) {
      const keywords = questionKeywords(chunk);
      if (!keywords.length) continue;
      pool.push({ id: crypto.randomUUID(), documentId: document.id, documentTitle: document.title, icon: document.icon,
        prompt: interviewPrompt(chunk.heading, keywords), source: chunk.text, heading: chunk.heading,
        referenceAnswer: chunk.text, explanation: "",
        blockIndex: chunk.blockIndex, keywords, depth: 1, engine: "local", model: null });
    }
    pools.push(pool);
  }
  for (let index = 0; questions.length < 12 && pools.some((pool) => pool[index]); index += 1) {
    for (const pool of pools) { if (pool[index]) questions.push(pool[index]); if (questions.length === 12) break; }
  }
  return questions;
}

export function evaluateInterview(question: InterviewQuestion, answer: string): InterviewFeedback {
  const answerTerms = new Set(tokenize(answer));
  const matched = question.keywords.filter((word) => answer.toLocaleLowerCase("zh-CN").includes(word.toLocaleLowerCase("zh-CN")) || answerTerms.has(word));
  const omissions = question.keywords.filter((word) => !matched.includes(word));
  const coverage = question.keywords.length ? Math.round(matched.length / question.keywords.length * 100) : 0;
  const message = coverage >= 75 ? "回答覆盖了大部分关键点，可以继续下一题。" : coverage >= 40 ? "方向基本正确，但还有几个关键点值得补充。" : "回答与笔记中的关键内容重合较少，建议先看遗漏点再追问。";
  const followUp = omissions.length && question.depth < 3 ? { ...question, id: crypto.randomUUID(), depth: question.depth + 1,
    prompt: `继续追问：请具体说明“${omissions.slice(0, 2).join("”和“")}”在这个主题中的作用。`, keywords: omissions.slice(0, 5) } : null;
  return { coverage, matched, omissions, message, followUp, engine: "local", model: null, notice: null };
}

export function inspectKnowledgeHealth(): KnowledgeHealth {
  const db = getDatabase();
  const documents = listDocuments(false);
  const issues: HealthIssue[] = [];
  const duplicateGroups = db.prepare(`SELECT title, GROUP_CONCAT(id) AS ids, COUNT(*) AS count FROM documents
    WHERE is_deleted = 0 GROUP BY title HAVING COUNT(*) > 1`).all() as Array<{ title: string; ids: string; count: number }>;
  for (const group of duplicateGroups) for (const id of group.ids.split(",")) issues.push({ id: `duplicate:${id}`, kind: "duplicate-title", severity: "attention",
    title: "标题重复", detail: `共有 ${group.count} 篇文档使用“${group.title}”，双链选择时容易混淆。`, documentId: id, documentTitle: group.title });

  const contentGroups = new Map<string, typeof documents>();
  for (const document of documents) {
    const normalized = document.plainText.toLocaleLowerCase("zh-CN").replace(/[\s\p{P}]+/gu, "");
    if (normalized.length < 40) continue;
    contentGroups.set(normalized, [...(contentGroups.get(normalized) ?? []), document]);
  }
  for (const group of contentGroups.values()) if (group.length > 1) for (const document of group) issues.push({ id: `content:${document.id}`,
    kind: "duplicate-content", severity: "suggestion", title: "正文内容重复", detail: `与另外 ${group.length - 1} 篇文档的正文基本相同，可以考虑合并。`,
    documentId: document.id, documentTitle: document.title });

  const linkRows = db.prepare(`SELECT l.source_id, l.target_id, l.target_title, s.title AS source_title,
      t.id AS live_target, (SELECT COUNT(*) FROM documents c WHERE c.is_deleted = 0 AND c.title = l.target_title) AS candidates
    FROM document_links l JOIN documents s ON s.id = l.source_id AND s.is_deleted = 0
    LEFT JOIN documents t ON t.id = l.target_id AND t.is_deleted = 0
    WHERE l.target_id IS NULL OR t.id IS NULL`).all() as Array<{ source_id: string; target_id: string | null; target_title: string; source_title: string; live_target: string | null; candidates: number }>;
  for (const link of linkRows) {
    const kind = link.target_id ? "broken-link" : link.candidates > 1 ? "ambiguous-link" : "unexplained";
    const detail = link.target_id ? `“${link.target_title}”指向的文档已不存在。` : link.candidates > 1
      ? `“${link.target_title}”存在 ${link.candidates} 个同名目标，需要明确选择。` : `提到了“${link.target_title}”，但还没有对应的解释文档。`;
    issues.push({ id: `link:${link.source_id}:${link.target_title}:${kind}`, kind, severity: "attention", title: kind === "broken-link" ? "失效链接" : kind === "ambiguous-link" ? "链接目标不明确" : "概念尚未解释",
      detail, documentId: link.source_id, documentTitle: link.source_title });
  }

  const staleBefore = Date.now() - 30 * 86400000;
  for (const document of documents) if ((document.title === "未命名文档" || document.plainText.trim().length < 80) && new Date(document.updatedAt).getTime() < staleBefore) {
    issues.push({ id: `draft:${document.id}`, kind: "stale-draft", severity: "suggestion", title: "草稿长期未整理",
      detail: `正文只有 ${document.plainText.trim().length} 个字符，且超过 30 天未修改。`, documentId: document.id, documentTitle: document.title });
  }
  return { issues, documents: documents.length, checkedAt: new Date().toISOString() };
}

export function versionSummaries(documentId: string): VersionSummary[] {
  const document = getDocument(documentId);
  if (!document || document.isDeleted) return [];
  return listDocumentVersions(getDatabase(), documentId).map((version) => ({ id: version.id, title: version.title,
    preview: excerpt(version.plainText.replace(/\s+/g, " ").trim() || "空文档", 150), characterCount: version.plainText.length, createdAt: version.createdAt }));
}

export function readVersion(documentId: string, versionId: string) {
  const document = getDocument(documentId);
  if (!document || document.isDeleted) return null;
  return getDocumentVersion(getDatabase(), documentId, versionId);
}
