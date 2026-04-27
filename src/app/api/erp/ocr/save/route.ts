import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { appendToSheet } from "@/lib/google";

export const runtime = "nodejs";

const SHEET_IDS: Record<string, Record<string, string>> = {
  "2025": {
    palermo: process.env.SHEET_PALERMO_2025 || "",
    belgrano: process.env.SHEET_BELGRANO_2025 || "",
    madero: process.env.SHEET_MADERO_2025 || "",
  },
  "2026": {
    palermo: process.env.SHEET_PALERMO_2026 || "",
    belgrano: process.env.SHEET_BELGRANO_2026 || "",
    madero: process.env.SHEET_MADERO_2026 || "",
  },
};

const ERP_CONFIG_SHEET = process.env.ERP_CONFIG_SHEET_ID || "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";

interface SaveBody {
  sucursal: string;
  year: string;
  proveedor: string;
  fechaFC: string; // YYYY-MM-DD
  fechaPago: string; // YYYY-MM-DD or empty
  nroComprobante: string;
  tipoComprobante: string;
  rubro: string;
  insumo: string;
  total: number;
  metodoPago: string;
  fechaVto: string; // YYYY-MM-DD or empty
  // Para el log OCR
  confianza: number;
  notas: string;
  fotoUrl?: string;
}

/**
 * Convertir YYYY-MM-DD a DD/MM/YYYY (formato del sheet)
 */
function toSheetDate(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export async function POST(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: "Sesion expirada" }, { status: 401 });

  try {
    const body = (await request.json()) as SaveBody;

    if (!body.sucursal || !body.year) {
      return NextResponse.json({ error: "Falta sucursal o year" }, { status: 400 });
    }
    if (!body.proveedor || !body.total) {
      return NextResponse.json({ error: "Faltan campos requeridos: proveedor y total" }, { status: 400 });
    }

    const sheetId = SHEET_IDS[body.year]?.[body.sucursal];
    if (!sheetId) {
      return NextResponse.json({ error: `Sheet no configurado para ${body.sucursal} ${body.year}` }, { status: 400 });
    }

    const hoy = new Date().toISOString().substring(0, 10);
    const fechaIngreso = toSheetDate(hoy);
    const fechaFC = toSheetDate(body.fechaFC);
    const fechaPago = toSheetDate(body.fechaPago);
    const fechaVto = toSheetDate(body.fechaVto);

    // Estructura de la tab EGRESOS:
    // [vacio] | Fecha ingreso | Fecha FC | Fecha Pago | PROVEEDOR | Tipo | Nro | Rubro | INSUMOS | Total | unidad | Precio Un | Metodo Pago | Verif | Vto.
    const totalStr = "$ " + body.total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const row = [
      "",                                  // A: nro fila (auto)
      fechaIngreso,                        // B: Fecha ingreso
      fechaFC,                             // C: Fecha FC
      fechaPago,                           // D: Fecha Pago
      body.proveedor,                      // E: PROVEEDOR
      body.tipoComprobante,                // F: Tipo comprobante
      body.nroComprobante,                 // G: Nro
      body.rubro,                          // H: Rubro
      body.insumo,                         // I: INSUMOS
      totalStr,                            // J: Total (con formato $)
      "1,00",                              // K: unidad de medida
      totalStr,                            // L: Precio Un
      body.metodoPago || "Sin pagar",      // M: Metodo de Pago
      "ok",                                // N: Verif (manual)
      fechaVto,                            // O: Vto.
    ];

    // 1. Append a EGRESOS
    await appendToSheet(sheetId, "EGRESOS!A:O", [row]);

    // 2. Log a Facturas_OCR del workbook config
    try {
      const ocrLogRow = [
        new Date().toISOString(),
        session.email || "",
        body.sucursal,
        body.proveedor,
        body.tipoComprobante,
        body.nroComprobante,
        body.fechaFC,
        body.rubro,
        body.insumo,
        body.total,
        "",                       // CBU/Cuenta (no extraído por OCR)
        body.fotoUrl || "",       // FotoURL
        body.confianza,
        "Cargado",                // Estado
        body.notas,
      ];
      await appendToSheet(ERP_CONFIG_SHEET, "Facturas_OCR!A:O", [ocrLogRow]);
    } catch (logErr) {
      console.error("OCR save log error (no crítico):", logErr);
    }

    return NextResponse.json({ ok: true, message: `Factura cargada en EGRESOS de ${body.sucursal} ${body.year}` });
  } catch (e) {
    console.error("OCR save error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error guardando" },
      { status: 500 }
    );
  }
}
