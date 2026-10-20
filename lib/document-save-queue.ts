import type { DocumentPatch, DocumentRecord } from "./document-types";

const DRAFT_PREFIX = "knowledge-desk:draft:";
type Entry = {
  pending: DocumentPatch;
  inFlight: DocumentPatch | null;
  timer: ReturnType<typeof setTimeout> | null;
  promise: Promise<boolean> | null;
};

type Options = {
  request: (id: string, patch: DocumentPatch, keepalive: boolean) => Promise<DocumentRecord>;
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
  onSaved: (id: string, saved: DocumentRecord, applied: DocumentPatch) => void;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
  delay?: number;
};

export class DocumentSaveQueue {
  private entries = new Map<string, Entry>();
  private storageFailed = false;

  constructor(private options: Options) {}

  get hasPending() { return this.entries.size > 0; }

  getDraft(id: string): DocumentPatch {
    const entry = this.entries.get(id);
    return entry ? { ...entry.inFlight, ...entry.pending } : {};
  }

  private persist(id: string) {
    try {
      const storage = this.options.storage();
      if (this.entries.has(id)) storage.setItem(DRAFT_PREFIX + id, JSON.stringify(this.getDraft(id)));
      else storage.removeItem(DRAFT_PREFIX + id);
      this.storageFailed = false;
    } catch {
      if (!this.storageFailed) this.options.onError("本地草稿写入失败，请保持页面打开，等待自动保存完成。");
      this.storageFailed = true;
    }
  }

  enqueue(id: string, patch: DocumentPatch) {
    if (!Object.keys(patch).length) return;
    const entry = this.entries.get(id) ?? { pending: {}, inFlight: null, timer: null, promise: null };
    entry.pending = { ...entry.pending, ...patch };
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => { entry.timer = null; void this.flush(id); }, this.options.delay ?? 650);
    this.entries.set(id, entry);
    this.persist(id);
    this.options.onStatus("正在保存");
  }

  restore(id: string) {
    if (this.entries.has(id)) return;
    try {
      const raw = this.options.storage().getItem(DRAFT_PREFIX + id);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DocumentPatch;
      const patch: DocumentPatch = {};
      if (typeof parsed.content === "string") patch.content = parsed.content;
      if (typeof parsed.title === "string") patch.title = parsed.title;
      if (typeof parsed.icon === "string" || parsed.icon === null) patch.icon = parsed.icon;
      if (Array.isArray(parsed.tags) && parsed.tags.every((tag) => typeof tag === "string")) patch.tags = parsed.tags;
      if (typeof parsed.isPinned === "boolean") patch.isPinned = parsed.isPinned;
      // Replaying hierarchy changes from an old session could undo a newer move.
      this.enqueue(id, patch);
    } catch { this.options.onError("有一份本地草稿无法读取，请检查浏览器存储。"); }
  }

  discard(id: string) {
    const entry = this.entries.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    this.entries.delete(id);
    this.persist(id);
  }

  async flush(id?: string, keepalive = false): Promise<boolean> {
    if (id === undefined) {
      const results = await Promise.all([...this.entries.keys()].map((key) => this.flush(key, keepalive)));
      return results.every(Boolean);
    }
    const entry = this.entries.get(id);
    if (!entry) return true;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    if (entry.promise) {
      const success = await entry.promise;
      return success ? this.flush(id, keepalive) : false;
    }
    if (!Object.keys(entry.pending).length) return true;
    const payload = entry.pending;
    entry.pending = {};
    entry.inFlight = payload;
    entry.promise = this.options.request(id, payload, keepalive).then((saved) => {
      if (this.entries.get(id) !== entry) return true;
      // Only reconcile fields that have not been edited again while saving.
      const applied = Object.fromEntries(Object.keys(payload).filter((key) => !(key in entry.pending)).map((key) => [key, saved[key as keyof DocumentPatch]])) as DocumentPatch;
      entry.inFlight = null;
      this.options.onSaved(id, saved, applied);
      if (!Object.keys(entry.pending).length) this.entries.delete(id);
      this.persist(id);
      this.options.onStatus(this.hasPending ? "正在保存" : "已自动保存");
      return true;
    }).catch((cause: unknown) => {
      if (this.entries.get(id) !== entry) return false;
      entry.pending = { ...payload, ...entry.pending };
      entry.inFlight = null;
      this.persist(id);
      this.options.onStatus("保存失败，草稿已保留");
      this.options.onError(cause instanceof Error ? cause.message : "保存失败");
      return false;
    }).finally(() => { entry.promise = null; });
    const success = await entry.promise;
    // Continue immediately if the debounce expired while the request was running.
    if (success && this.entries.get(id) === entry && !entry.timer) return this.flush(id, keepalive);
    return success;
  }

  pauseTimers() {
    for (const entry of this.entries.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
    }
  }
}
