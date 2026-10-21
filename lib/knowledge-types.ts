export type LinkedDocument = { id: string; title: string; icon: string | null; parentId: string | null };
export type DocumentReference = { key: string; title: string; targetId: string | null; target: LinkedDocument | null; candidates: LinkedDocument[] };
export type DocumentConnections = { outgoing: DocumentReference[]; backlinks: LinkedDocument[] };
export type StudyStatus = "learning" | "consolidating" | "mastered";
export type ReviewGrade = "again" | "hard" | "good" | "easy";
export type ReviewPlan = { documentId: string; stage: number; status: StudyStatus; dueAt: string; lastReviewedAt: string | null; reviewCount: number; version: number };
export type ReviewItem = LinkedDocument & { review: ReviewPlan };
export type ReviewOverview = { items: ReviewItem[]; total: number; due: number; reviewedToday: number };
export const studyStatusLabels: Record<StudyStatus, string> = { learning: "学习中", consolidating: "待巩固", mastered: "已掌握" };

const DAY = 24 * 60 * 60 * 1000;
const intervals = [1, 3, 7, 14, 30, 60, 120];
export const statusForStage = (stage: number): StudyStatus => stage >= 3 ? "mastered" : stage >= 1 ? "consolidating" : "learning";

export function nextReview(stage: number, grade: ReviewGrade, now = Date.now()) {
  const nextStage = grade === "again" ? 0 : grade === "hard" ? Math.max(0, stage - 1) : Math.min(7, grade === "easy" ? Math.max(3, stage + 2) : stage + 1);
  const delay = grade === "again" ? 10 * 60 * 1000 : grade === "hard" ? DAY : intervals[Math.max(0, nextStage - 1)] * DAY;
  return { stage: nextStage, status: statusForStage(nextStage), dueAt: new Date(now + delay).toISOString() };
}
