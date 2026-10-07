import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredNote = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
  isPublic: boolean;
  group: string;
};

const dataDirectory = path.join(process.cwd(), "data");
const notesPath = path.join(dataDirectory, "notes.json");

const initialNotes: StoredNote[] = [
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

async function ensureDataFile() {
  await mkdir(dataDirectory, { recursive: true });
  try {
    await readFile(notesPath, "utf8");
  } catch {
    await writeFile(notesPath, JSON.stringify(initialNotes, null, 2), "utf8");
  }
}

export async function readNotes(): Promise<StoredNote[]> {
  await ensureDataFile();
  const content = await readFile(notesPath, "utf8");
  return JSON.parse(content) as StoredNote[];
}

export async function writeNotes(notes: StoredNote[]) {
  await ensureDataFile();
  const temporaryPath = `${notesPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(notes, null, 2), "utf8");
  await rename(temporaryPath, notesPath);
}

export function newNote(): StoredNote {
  return {
    id: `note-${Date.now()}`,
    title: "未命名笔记",
    content: "从这里开始记录。\n\n写下你刚刚学到的内容、自己的理解，或下一步要验证的问题。",
    tags: ["收集箱"],
    updatedAt: "刚刚",
    isPublic: false,
    group: "收集箱",
  };
}
