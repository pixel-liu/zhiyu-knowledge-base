export type KnowledgeTool = "ask" | "interview" | "health" | "versions";
export type WorkspaceView = "home" | "documents" | KnowledgeTool;

export const toolLabels: Record<KnowledgeTool, string> = {
  ask: "知识问答", interview: "模拟面试", health: "知识体检", versions: "版本时间轴",
};

export function isKnowledgeTool(value: string): value is KnowledgeTool {
  return Object.prototype.hasOwnProperty.call(toolLabels, value);
}

export function workspaceView(pathname: string, search: string): WorkspaceView {
  const tool = pathname.match(/^\/tools\/([^/]+)\/?$/)?.[1];
  if (tool && isKnowledgeTool(tool)) return tool;
  if (pathname === "/documents" || new URLSearchParams(search).has("document")) return "documents";
  return "home";
}
