import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export type AiProvider = "deepseek" | "openai";

export type AiConfig = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type AiConfigStatus = Omit<AiConfig, "apiKey"> & {
  configured: boolean;
  source: "saved" | "environment" | null;
};

const dataDirectory = process.env.ZHIYU_DATA_DIR ? path.resolve(process.env.ZHIYU_DATA_DIR) : path.join(process.cwd(), "data");
const configPath = path.join(dataDirectory, "ai-interview.json");

const defaults = (provider: AiProvider) => provider === "deepseek"
  ? { baseUrl: "https://api.deepseek.com", model: "deepseek-flash" }
  : { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" };

function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function isStoredConfig(value: unknown): value is AiConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<AiConfig>;
  return (config.provider === "deepseek" || config.provider === "openai")
    && typeof config.apiKey === "string" && Boolean(config.apiKey.trim())
    && typeof config.baseUrl === "string" && Boolean(config.baseUrl.trim())
    && typeof config.model === "string" && Boolean(config.model.trim());
}

export function getSavedAiConfig(): AiConfig | null {
  if (!existsSync(configPath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    if (!isStoredConfig(parsed)) return null;
    return {
      provider: parsed.provider,
      apiKey: parsed.apiKey.trim(),
      baseUrl: cleanUrl(parsed.baseUrl),
      model: parsed.model.trim(),
    };
  } catch {
    return null;
  }
}

export function getEnvironmentAiConfig(): AiConfig | null {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    const fallback = defaults("deepseek");
    return {
      provider: "deepseek", apiKey: deepseekKey,
      baseUrl: cleanUrl(process.env.DEEPSEEK_BASE_URL || fallback.baseUrl),
      model: process.env.DEEPSEEK_MODEL?.trim() || fallback.model,
    };
  }
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) return null;
  const fallback = defaults("openai");
  return {
    provider: "openai", apiKey: openaiKey,
    baseUrl: cleanUrl(process.env.OPENAI_BASE_URL || fallback.baseUrl),
    model: process.env.OPENAI_MODEL?.trim() || fallback.model,
  };
}

export function getAiConfig(): AiConfig | null {
  return getSavedAiConfig() ?? getEnvironmentAiConfig();
}

export function getAiConfigStatus(): AiConfigStatus {
  const saved = getSavedAiConfig();
  const config = saved ?? getEnvironmentAiConfig();
  if (!config) {
    const fallback = defaults("deepseek");
    return { configured: false, source: null, provider: "deepseek", ...fallback };
  }
  return {
    configured: true,
    source: saved ? "saved" : "environment",
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
  };
}

export function saveAiConfig(input: AiConfig) {
  const saved = { ...input, apiKey: input.apiKey.trim(), baseUrl: cleanUrl(input.baseUrl), model: input.model.trim() };
  mkdirSync(dataDirectory, { recursive: true });
  writeFileSync(configPath, JSON.stringify(saved), { encoding: "utf8", mode: 0o600 });
  try { chmodSync(configPath, 0o600); } catch { /* Windows does not support POSIX file modes. */ }
}

export function clearSavedAiConfig() {
  rmSync(configPath, { force: true });
}
