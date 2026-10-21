"use client";

import { BookOpen, Eye, EyeOff, LoaderCircle, Moon, Sun } from "lucide-react";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { useTheme } from "@/components/providers/theme-provider";

const subscribe = () => () => {};

export function LoginForm({ setup, destination }: { setup: boolean; destination: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (setup && password !== confirmation) { setError("两次输入的密码不一致。"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: setup ? "setup" : "login", username, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) { window.location.replace("/login"); return; }
        throw new Error(result.message || "登录失败，请重试。");
      }
      // Full navigation drops any cached unauthenticated server components.
      window.location.replace(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "连接失败，请检查服务是否正在运行。");
      setBusy(false);
    }
  }

  return <div className="docspace auth-page">
    <header className="doc-topbar">
      <div className="doc-topbar-left"><BookOpen size={19} /><b>知屿文档</b></div>
      <div className="doc-topbar-actions"><button type="button" title={dark ? "切换为白色模式" : "切换为黑色模式"} aria-label={dark ? "切换为白色模式" : "切换为黑色模式"} onClick={() => setTheme(dark ? "light" : "dark")}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button></div>
    </header>
    <main className="auth-main">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-mark"><BookOpen size={27} strokeWidth={1.7} aria-hidden="true" /></div>
        <h1 id="auth-title">{setup ? "开启你的文档库" : "欢迎回来"}</h1>
        <p className="auth-description">{setup ? "设置一个账号，留一处空间给你的知识。" : "登录知屿，继续记录与思考。"}</p>
        <form onSubmit={submit} className="auth-form" aria-busy={busy}>
          <div className="auth-field"><label htmlFor="username">账号</label><input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} placeholder={setup ? "设置你的账号" : "输入账号"} minLength={2} maxLength={40} required disabled={busy} autoFocus /></div>
          <div className="auth-field"><label htmlFor="password">密码</label><div className="auth-password"><input id="password" name="password" type={visible ? "text" : "password"} autoComplete={setup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={setup ? "设置密码，至少 8 个字符" : "输入密码"} minLength={8} maxLength={128} required disabled={busy} /><button type="button" aria-label={visible ? "隐藏密码" : "显示密码"} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
          {setup && <div className="auth-field"><label htmlFor="confirmation">确认密码</label><input id="confirmation" name="confirmation" type={visible ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="再次输入密码" minLength={8} maxLength={128} required disabled={busy} /></div>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy && <LoaderCircle size={17} className="auth-spinner" />}{busy ? "正在进入…" : setup ? "创建账号并进入" : "登录"}</button>
        </form>
        <p className="auth-note">{setup ? "首次使用仅需设置一次，已有文档会完整保留。" : "这台电脑上的文档，只为你保留。"}</p>
      </section>
    </main>
    <footer className="auth-footer">知屿文档<span>让知识有处可栖</span></footer>
  </div>;
}
