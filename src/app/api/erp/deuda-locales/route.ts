import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { analyzeDeudaLocales } from "@/lib/deuda-locales";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "deuda_locales");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") || "2026";
    const result = await analyzeDeudaLocales(year);
    // Limit centralizados for the dedicated page (top 100)
    return NextResponse.json({
      year,
      ...result,
      centralizados: result.centralizados.slice(0, 100),
    });
  } catch (e) {
    console.error("deuda-locales:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
