import { NextResponse } from "next/server";
import { getReviewOverview } from "@/lib/knowledge-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json(getReviewOverview()); }
