import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi, userHasPermission } from "@/lib/admin-permissions";
import { getFactura, updateFactura, FacturaQueue } from "@/lib/facturas-queue";
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

function toSheetDate(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatArs(n: number): string {
  return "$ " + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Mapear un tipo de impuesto al rubro correspondiente del sheet.
 * Rubros válidos del sheet (según DATOSSS): IIBB, IMP. INTERNOS, Impuestos, IVA, Acuerdos, etc.
 */
function mapImpuestoToRubro(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes("iibb") || t.includes("ingresos brut")) return "IIBB";
  if (t.includes("percep") && t.includes("iva")) return "IVA";
  if (t.includes("percep") && (t.includes("iibb") || t.includes("ing"))) return "IIBB";
  if (t.includes("percep")) return "IIBB";
  if (t.includes("iva")) return "IVA";
  if (t.includes("interno")) return "IMP. INTERNOS";
  return "Impuestos";
}

/**
 * Genera las filas a insertar en EGRESOS para una factura.
 *
 * Modelo:
 * - 1 row PRINCIPAL con el subtotal sin IVA de la factura
 *   (insumo = descripción consolidada de los items)
 * - 1 row por cada impuesto (IVA, IIBB, percep, etc.) con su rubro
 *
 * Cantidad/unidad de la row principal:
 * - Si la factura tiene 1 solo item: usa su cantidad real (3.2) y unidad real (kg)
 * - Si la factura tiene varios items: cantidad=1, unidad="unidad"
 *   (la descripción consolida los items, ej "Lavandina, Detergente y 14 más")
 *
 * Estructura columnas EGRESOS (15 cols A-O):
 * A: nro auto
 * B: Fecha ingreso
 * C: Fecha FC
 * D: Fecha Pago
 * E: PROVEEDOR
 * F: Tipo comprobante
 * G: Nro comprobante
 * H: Rubro
 * I: INSUMOS
 * J: Total de la línea
 * K: cantidad (numérica)
 * L: Precio Un.
 * M: Metodo de Pago
 * N: Verif.
 * O: Vto.
 */
function buildEgresosRows(f: FacturaQueue): string[][] {
  const rows: string[][] = [];
  const fechaIng = toSheetDate(f.fechaIngreso) || toSheetDate(new Date().toISOString().substring(0, 10));
  const fechaFC = toSheetDate(f.fechaFC);
  const fechaPago = toSheetDate(f.fechaPago);
  const fechaVto = toSheetDate(f.fechaVto);
  const metodoPago = f.metodoPago || "Sin pagar";
  const tipo = f.tipoComprobante || "";
  const nro = f.nroComprobante || "";
  const proveedor = f.proveedor || "";

  const validItems = (f.items || []).filter((i) => i.descripcion || i.subtotal);

  // Construir la descripción del insumo principal
  let insumoDesc = f.insumo || "";
  let cantidadMain = 1;
  let unidadMain = "unidad";
  let precioUnMain = 0;
  let totalMain = f.subtotal || 0;

  if (validItems.length === 1) {
    // Factura con un solo item: usar sus datos exactos
    const it = validItems[0];
    if (!insumoDesc) insumoDesc = it.descripcion;
    cantidadMain = it.cantidad || 1;
    unidadMain = it.unidad || "unidad";
    precioUnMain = it.precioUnitario || (cantidadMain > 0 ? it.subtotal / cantidadMain : 0);
    totalMain = it.subtotal || totalMain;
  } else if (validItems.length > 1) {
    // Factura multi-item: consolidar
    if (!insumoDesc) {
      const list = validItems.map((i) => i.descripcion).filter(Boolean);
      if (list.length <= 3) {
        insumoDesc = list.join(", ").substring(0, 100);
      } else {
        insumoDesc = `${list[0]}, ${list[1]} y ${list.length - 2} más`.substring(0, 100);
      }
    }
    cantidadMain = 1;
    unidadMain = "unidad";
    // totalMain ya es el subtotal de la factura (suma de items sin IVA)
    if (totalMain === 0) {
      totalMain = validItems.reduce((s, i) => s + (i.subtotal || 0), 0);
    }
    precioUnMain = totalMain;
  } else {
    // Sin items: usar subtotal o total
    if (totalMain === 0) totalMain = f.total || 0;
    precioUnMain = totalMain;
  }

  // Fallback final: si no hay subtotal NI items, usar total (puede pasar con
  // facturas viejas sin desglose)
  const hasImpuestos = (f.impuestos || []).some((imp) => imp.monto && imp.monto > 0);
  if (totalMain === 0 && !hasImpuestos) {
    totalMain = f.total;
    precioUnMain = f.total;
  }

  // Row principal de la factura
  if (totalMain > 0 || !hasImpuestos) {
    rows.push([
      "",                            // A
      fechaIng,                      // B
      fechaFC,                       // C
      fechaPago,                     // D
      proveedor,                     // E
      tipo,                          // F
      nro,                           // G
      f.rubro || "",                 // H Rubro
      insumoDesc || "",              // I INSUMOS
      formatArs(totalMain),          // J Total
      cantidadMain.toLocaleString("es-AR", { useGrouping: false }), // K cantidad
      formatArs(precioUnMain),       // L Precio Un
      metodoPago,                    // M
      "ok",                          // N Verif
      fechaVto,                      // O Vto
    ]);
  }

  // Rows de impuestos (IVA, IIBB, Percep, etc.)
  for (const imp of f.impuestos || []) {
    if (!imp.monto || imp.monto === 0) continue;
    const rubro = mapImpuestoToRubro(imp.tipo);
    rows.push([
      "", fechaIng, fechaFC, fechaPago, proveedor, tipo, nro,
      rubro, imp.tipo, formatArs(imp.monto),
      "1", formatArs(imp.monto), metodoPago, "ok", fechaVto,
    ]);
  }

  return rows;
}

async function exportToEgresos(f: FacturaQueue): Promise<{ rowCount: number }> {
  const sheetId = SHEET_IDS[f.year]?.[f.sucursal];
  if (!sheetId) {
    throw new Error(`Sheet no configurado para ${f.sucursal} ${f.year}`);
  }
  const rows = buildEgresosRows(f);
  if (rows.length === 0) {
    throw new Error("No hay datos para exportar (sin items ni impuestos ni total)");
  }
  await appendToSheet(sheetId, "EGRESOS!A:O", rows);
  return { rowCount: rows.length };
}

/**
 * POST /api/erp/facturas/approve
 * Body: { id, edits?: Partial<FacturaQueue>, notas?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!userHasPermission(user, "facturas_aprobar") && !userHasPermission(user, "*")) {
    return NextResponse.json({ error: "Sin permiso para aprobar facturas" }, { status: 403 });
  }

  try {
    const body = await request.json() as { id: string; edits?: Partial<FacturaQueue>; notas?: string };
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const factura = await getFactura(body.id);
    if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    if (factura.estado === "aprobada") {
      return NextResponse.json({ error: "Factura ya aprobada" }, { status: 400 });
    }

    const merged: FacturaQueue = { ...factura, ...(body.edits || {}) };

    if (!merged.proveedor) return NextResponse.json({ error: "Proveedor requerido" }, { status: 400 });
    if (!merged.total || merged.total <= 0) return NextResponse.json({ error: "Total debe ser > 0" }, { status: 400 });
    if (!merged.sucursal) return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 });
    if (!merged.year) return NextResponse.json({ error: "Año requerido" }, { status: 400 });

    const exportResult = await exportToEgresos(merged);

    const updated = await updateFactura(body.id, {
      ...body.edits,
      estado: "aprobada",
      reviewedBy: user.email,
      reviewedAt: new Date().toISOString(),
      notasReview: body.notas || "",
    });

    return NextResponse.json({
      ok: true,
      message: `Factura aprobada · ${exportResult.rowCount} fila(s) exportadas a EGRESOS de ${merged.sucursal} ${merged.year}`,
      factura: updated,
    });
  } catch (e) {
    console.error("approve factura error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
