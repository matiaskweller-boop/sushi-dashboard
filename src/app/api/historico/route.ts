import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getLiveMonthlySummaries } from "@/lib/dashboard-data";
import fs from "fs";
import path from "path";

function findDataFile(): string {
  const candidates = [
    path.join(process.cwd(), "data/historico/resumen-mensual.json"),
    path.join(process.cwd(), "masunori-dashboard/data/historico/resumen-mensual.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`No se encontró resumen-mensual.json. Buscado en: ${candidates.join(", ")}`);
}

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
    // 1. Leer datos históricos del JSON
    const filePath = findDataFile();
    const raw = fs.readFileSync(filePath, "utf-8");
    const historicData = JSON.parse(raw) as Record<
      string,
      Record<string, unknown>
    >;

    // 2. Obtener datos live de Fudo (desde oct 2025, cacheado 30 min)
    let liveData: Record<string, Record<string, unknown>> = {};
    try {
      liveData = await getLiveMonthlySummaries();
    } catch (err) {
      console.error("Error obteniendo datos live de Fudo:", err);
    }

    // 3. Mergear: histórico + live (live sobreescribe meses que ya existan)
    const merged: Record<string, Record<string, unknown>> = {};

    const allSucursales = Array.from(
      new Set([...Object.keys(historicData), ...Object.keys(liveData)])
    );

    for (const sucursal of allSucursales) {
      merged[sucursal] = {
        ...(historicData[sucursal] || {}),
        ...(liveData[sucursal] || {}),
      };
    }

    return NextResponse.json(merged, {
      headers: {
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (error) {
    console.error("Error leyendo datos históricos:", error);
    return NextResponse.json(
      {
        error: "Error al leer datos históricos",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
