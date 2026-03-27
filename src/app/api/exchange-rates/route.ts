import { NextResponse } from "next/server";
import {
  getCurrentBlueRate,
  getHistoricalBlueRates,
  calcMonthlyAverages,
} from "@/lib/exchange-rates";

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

    const monthly = calcMonthlyAverages(historical);

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
