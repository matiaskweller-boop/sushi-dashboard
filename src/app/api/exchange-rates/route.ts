import { NextResponse } from "next/server";
import {
  getCurrentBlueRate,
  getHistoricalBlueRates,
  calcMonthlyAverages,
} from "@/lib/exchange-rates";
import fallbackRates from "../../../../data/exchange-rates.json";

export async function GET() {
  try {
    const [current, historical] = await Promise.all([
      getCurrentBlueRate(),
      getHistoricalBlueRates(),
    ]);

    if (current === null) {
      return NextResponse.json(
        { error: "No se pudo obtener el tipo de cambio" },
        { status: 502 }
      );
    }

    // Merge: fallback rates (manual) + Bluelytics (auto, has priority)
    const bluelyticsMonthly = calcMonthlyAverages(historical);
    // Filter out non-rate fields (like _nota)
    const fallback: Record<string, number> = {};
    for (const [key, value] of Object.entries(fallbackRates)) {
      if (/^\d{4}-\d{2}$/.test(key) && typeof value === "number") {
        fallback[key] = value;
      }
    }
    const monthly: Record<string, number> = {
      ...fallback,
      ...bluelyticsMonthly,
    };

    return NextResponse.json(
      { current, monthly },
      {
        headers: {
          "Cache-Control": "private, max-age=3600",
        },
      }
    );
  } catch (error) {
    console.error("Error obteniendo tipo de cambio:", error);
    return NextResponse.json(
      { error: "Error al obtener tipo de cambio" },
      { status: 500 }
    );
  }
}
