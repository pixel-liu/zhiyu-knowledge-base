"use client";

import { KeyRound, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { AiConfigStatus, AiProvider } from "@/lib/ai-config";

const defaults: Record<AiProvider, Pick<AiConfigStatus, "baseUrl" | "model">> = {
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
};

type FormState = { provider: AiProvider; apiKey: string; model: string; baseUrl: string };

export function AiConfigDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (status: AiConfigStatus) => void }) {
  const [form, setForm] = useState<FormState>({ provider: "deepseek", apiKey: "", ...defaults.deepseek });
  const [status, setStatus] = useState<AiConfigStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return null;
      setLoading(true); setError(""); setNotice("");
      return fetch("/api/ai-config", { signal: controller.signal });
    })
      .then(async (response) => {
        if (!response) return null;
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.message || "无法读取模型配置。");
        return body as AiConfigStatus;
      })
      .then((next) => {
        if (controller.signal.aborted || !next) return;
        setStatus(next);
        setForm({ provider: next.provider, apiKey: "", model: next.model, baseUrl: next.baseUrl });
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取模型配置。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open]);

  if (!open) return null;

  function chooseProvider(provider: AiProvider) {
    setForm((current) => ({ ...current, provider, ...defaults[provider] }));
    setNotice(""); setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ai-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, apiKey: form.apiKey.trim() || undefined }),
      });
      const result = await response.json().catch(() => null) as (AiConfigStatus & { message?: string }) | null;
      if (!response.ok || !result) throw new Error(result?.message || "保存失败，请重试。");
      setStatus(result); setForm((current) => ({ ...current, apiKey: "" })); onSaved(result);
      setNotice("已保存，下一次出题或追问会立即使用此配置。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，请重试。"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (saving || status?.source !== "saved") return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ai-config", { method: "DELETE" });
      const result = await response.json().catch(() => null) as (AiConfigStatus & { message?: string }) | null;
      if (!response.ok || !result) throw new Error(result?.message || "移除失败，请重试。");
      setStatus(result); setForm({ provider: result.provider, apiKey: "", model: result.model, baseUrl: result.baseUrl }); onSaved(result);
      setNotice(result.configured ? "已移除本地配置，已恢复环境变量配置。" : "已移除本地配置，模拟面试将使用本地规则出题。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "移除失败，请重试。"); }
    finally { setSaving(false); }
  }

  return <div className="lab-config-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="lab-config-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-config-title">
      <header><span className="lab-config-icon"><KeyRound size={19} /></span><div><h3 id="ai-config-title">配置大模型</h3><p>保存后立即用于下一次出题和追问。</p></div><button type="button" className="lab-config-close" aria-label="关闭配置" disabled={saving} onClick={onClose}><X size={18} /></button></header>
      <div className="lab-config-security"><ShieldCheck size={16} /><span>密钥只保存在本机服务端，不会显示在页面或导出到文档备份。</span></div>
      {loading ? <div className="lab-config-loading"><LoaderCircle size={18} />正在读取配置…</div> : <form onSubmit={save}>
        <label><span>服务商</span><select value={form.provider} disabled={saving} onChange={(event) => chooseProvider(event.target.value as AiProvider)}><option value="deepseek">DeepSeek</option><option value="openai">OpenAI 兼容接口</option></select></label>
        <label><span>API Key</span><input type="password" autoComplete="off" value={form.apiKey} disabled={saving} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder={status?.source === "saved" && status.provider === form.provider ? "留空则保留已保存的密钥" : "输入 API Key"} /></label>
        <div className="lab-config-grid"><label><span>模型</span><input value={form.model} disabled={saving} maxLength={200} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="模型名称" /></label><label><span>服务地址</span><input type="url" value={form.baseUrl} disabled={saving} maxLength={500} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://…" /></label></div>
        {status && <p className={`lab-config-status ${status.configured ? "is-ready" : ""}`}>{status.configured ? `${status.source === "saved" ? "已保存到本机" : "正在使用环境变量"}：${status.provider === "deepseek" ? "DeepSeek" : "OpenAI 兼容接口"} · ${status.model}` : "尚未配置，面试将使用本地规则出题。"}</p>}
        {notice && <p className="lab-config-notice" role="status">{notice}</p>}{error && <p className="lab-error" role="alert">{error}</p>}
        <footer>{status?.source === "saved" && <button type="button" className="lab-config-remove" disabled={saving} onClick={() => void remove()}>移除本地配置</button>}<span /><button type="button" className="lab-config-cancel" disabled={saving} onClick={onClose}>取消</button><button className="lab-primary" disabled={saving || !form.model.trim() || !form.baseUrl.trim()}>{saving ? "保存中…" : "保存并立即生效"}</button></footer>
      </form>}
    </section>
  </div>;
}
