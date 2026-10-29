import { NextRequest, NextResponse } from "next/server";
import { clearSavedAiConfig, getAiConfigStatus, getSavedAiConfig, saveAiConfig } from "@/lib/ai-config";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const configSchema = z.object({
  provider: z.enum(["deepseek", "openai"]),
  apiKey: z.string().trim().min(1).max(500).optional(),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().min(1).max(500).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch { return false; }
  }, "模型服务地址无效"),
}).strict();

export function GET() {
  return NextResponse.json(getAiConfigStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "配置内容无效，请检查服务商、模型和地址。" }, { status: 400 });
  const saved = getSavedAiConfig();
  const apiKey = parsed.data.apiKey || (saved?.provider === parsed.data.provider ? saved.apiKey : "");
  if (!apiKey) return NextResponse.json({ message: "请输入 API Key 后再保存。" }, { status: 400 });
  saveAiConfig({ ...parsed.data, apiKey });
  return NextResponse.json(getAiConfigStatus(), { headers: { "Cache-Control": "no-store" } });
}

export function DELETE() {
  clearSavedAiConfig();
  return NextResponse.json(getAiConfigStatus(), { headers: { "Cache-Control": "no-store" } });
}
