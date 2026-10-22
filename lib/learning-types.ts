export type KnowledgeCitation = {
  documentId: string;
  documentTitle: string;
  icon: string | null;
  blockIndex: number;
  heading: string | null;
  excerpt: string;
  score: number;
};

export type KnowledgeAnswer = {
  answer: string;
  citations: KnowledgeCitation[];
  matchedDocuments: number;
};

export type InterviewQuestion = {
  id: string;
  documentId: string;
  documentTitle: string;
  icon: string | null;
  prompt: string;
  source: string;
  heading: string | null;
  blockIndex: number;
  keywords: string[];
  depth: number;
};

export type InterviewFeedback = {
  coverage: number;
  matched: string[];
  omissions: string[];
  message: string;
  followUp: InterviewQuestion | null;
};

export type HealthIssueKind = "duplicate-title" | "duplicate-content" | "broken-link" | "unexplained" | "ambiguous-link" | "stale-draft";
export type HealthIssue = {
  id: string;
  kind: HealthIssueKind;
  severity: "attention" | "suggestion";
  title: string;
  detail: string;
  documentId: string;
  documentTitle: string;
};

export type KnowledgeHealth = {
  issues: HealthIssue[];
  documents: number;
  checkedAt: string;
};

export type VersionSummary = {
  id: string;
  title: string;
  preview: string;
  characterCount: number;
  createdAt: string;
};
