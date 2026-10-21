"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export function LogoutButton({ beforeLogout }: { beforeLogout: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!await beforeLogout()) {
        setError("文档尚未保存成功，请检查连接后再退出。");
        setBusy(false);
        return;
      }
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error("退出失败，请重试。");
      window.location.replace("/login");
    } catch {
      setError("退出失败，请检查连接后重试。");
      setBusy(false);
    }
  }
  return <><button type="button" title="退出登录" aria-label="退出登录" disabled={busy} onClick={() => void signOut()}><LogOut size={18} /></button>{error && <span className="doc-logout-error" role="alert">{error}</span>}</>;
}
