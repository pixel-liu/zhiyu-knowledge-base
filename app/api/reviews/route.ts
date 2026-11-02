import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getReviewOverview, removeReviewPlans } from "@/lib/knowledge-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json(getReviewOverview()); }

const removeSchema = z.object({ documentIds: z.array(z.string().trim().min(1).max(200)).min(1).max(10000) }).strict();
export async function DELETE(request: NextRequest) {
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "请选择要删除的复习计划。" }, { status: 400 });
  const deletedIds = removeReviewPlans(parsed.data.documentIds);
  return NextResponse.json({ deletedIds, overview: getReviewOverview() });
}
