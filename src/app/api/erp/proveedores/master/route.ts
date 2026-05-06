import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { readSheetRaw } from "@/lib/google";

export const runtime = "nodejs";

const SHEET_IDS_2026: Record<string, string> = {
  palermo: process.env.SHEET_PALERMO_2026 || "",
  belgrano: process.env.SHEET_BELGRANO_2026 || "",
  madero: process.env.SHEET_MADERO_2026 || "",
};

interface ProveedorMaster {
  proveedor: string;       // nombre comercial / display name
  razonSocial: string;
  cuit: string;
  alias: string;
  banco: string;
  cbu: string;
  producto: string;
  plazoPago: string;
}

let cache: { list: ProveedorMaster[]; expiresAt: number } | null = null;
const TTL = 10 * 60 * 1000;

/**
 * GET /api/erp/proveedores/master
 *
 * Devuelve lista deduplicada de proveedores conocidos desde DEUDA AL DIA
 * de las 3 sucursales. Útil para el combobox/picker en /administracion/facturas.
 *
 * NOTA: difiere de /api/erp/proveedores (que da deuda agregada) — esta es
 * solo el master simple para el picker, sin cálculos de deuda.
 */
export async function GET(request: NextRequest) {
  // Disponible para cualquier user con `facturas` permission
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;

  if (cache && cache.expiresAt > Date.now()) {
    return NextResponse.json({ proveedores: cache.list, cached: true });
  }

  try {
    const map = new Map<string, ProveedorMaster>();

    await Promise.all(
      Object.values(SHEET_IDS_2026).map(async (sheetId) => {
        if (!sheetId) return;
        try {
          const rows = await readSheetRaw(sheetId, "DEUDA AL DIA!A1:L200");
          // Skip header rows (row 0 = banner, row 1 = headers)
          for (const row of rows.slice(2)) {
            const proveedor = (row[0] || "").toString().trim();
            if (!proveedor || proveedor.length < 2) continue;

            const key = proveedor.toUpperCase();
            const existing = map.get(key);
            const data: ProveedorMaster = {
              proveedor,
              razonSocial: (row[6] || existing?.razonSocial || "").toString().trim(),
              cuit: extractCuit((row[6] || "").toString() + " " + (row[7] || "").toString()) || existing?.cuit || "",
              alias: (row[5] || existing?.alias || "").toString().trim(),
              banco: (row[7] || existing?.banco || "").toString().trim(),
              cbu: (row[8] || existing?.cbu || "").toString().trim(),
              producto: (row[10] || existing?.producto || "").toString().trim(),
              plazoPago: (row[11] || existing?.plazoPago || "").toString().trim(),
            };
            map.set(key, data);
          }
        } catch (e) {
          console.warn("master proveedores", e);
        }
      })
    );

    const list = Array.from(map.values()).sort((a, b) => a.proveedor.localeCompare(b.proveedor));
    cache = { list, expiresAt: Date.now() + TTL };
    return NextResponse.json({ proveedores: list, cached: false });
  } catch (e) {
    console.error("master proveedores error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

function extractCuit(text: string): string {
  const m = text.match(/(\d{2})[\s-]?(\d{8})[\s-]?(\d{1})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}
