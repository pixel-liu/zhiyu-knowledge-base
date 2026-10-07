"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  storageKey = "zhiyu-theme",
}: {
  children: React.ReactNode;
  storageKey?: string;
  defaultTheme?: ThemeMode;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  attribute?: string;
}) {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const resolvedTheme: ResolvedTheme = theme === "dark" ? "dark" : "light";

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "dark" || stored === "light") setThemeState(stored);
  }, [storageKey]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo(() => ({
    theme,
    resolvedTheme,
    setTheme: (nextTheme: ThemeMode) => {
      const next = nextTheme === "dark" ? "dark" : "light";
      setThemeState(next);
      window.localStorage.setItem(storageKey, next);
    },
  }), [resolvedTheme, storageKey, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return context;
}
