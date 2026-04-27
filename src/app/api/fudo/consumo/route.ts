import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getConsumptionData } from "@/lib/dashboard-data";

export async function GET(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  }

  try {
    const data = await getConsumptionData(6);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, max-age=600", // 10 min client cache
      },
    });
  } catch (error) {
    console.error("Error obteniendo datos de consumo:", error);
    return NextResponse.json(
      {
        error: "Error al obtener datos de consumo",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
