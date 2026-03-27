import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getAdvancedKPIs } from "@/lib/dashboard-data";

export async function GET(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const period = searchParams.get("period") || "today";
  const customFrom = searchParams.get("from") || undefined;
  const customTo = searchParams.get("to") || undefined;

  try {
    const data = await getAdvancedKPIs(period, customFrom, customTo);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error obteniendo KPIs avanzados:", error);
    return NextResponse.json(
      {
        error: "Error al obtener KPIs avanzados",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
