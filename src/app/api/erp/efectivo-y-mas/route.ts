import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { readSheetRaw, appendToSheet, parseArs, parseDate } from "@/lib/google";

export const runtime = "nodejs";

const SHEET_ID = process.env.SHEET_EFECTIVO_Y_MAS || "1x8ZI8qIDcHitHJA6Hadd3VtdZNwPL4h0pwOxyUghdw0";
const TAB = "RETIROS+CONSUMOS SOCIOS";

interface MovimientoSocio {
  rowIdx: number;
  fecha: string;       // formato original del sheet
  fechaISO: string | null; // YYYY-MM-DD si parseable
  quien: string;
  local: string;
  valorPesos: number;
  valorDolar: number;
  caja: string;
  medioPago: string;
  comoSeImputa: string;
}

interface SocioSummary {
  socio: string;
  totalPesos: number;
  totalDolar: number;
  porSucursal: Record<string, { pesos: number; dolar: number; count: number }>;
  porCaja: Record<string, { pesos: number; dolar: number; count: number }>;
  porMedioPago: Record<string, { pesos: number; dolar: number; count: number }>;
  count: number;
  movimientos: MovimientoSocio[];
}

/**
 * Normaliza nombre de socio para agrupar (case-insensitive + trim).
 */
function normalizeSocio(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

function parseRows(rows: string[][]): MovimientoSocio[] {
  if (rows.length < 2) return [];

  // Header row (look for "FECHA" in first cell of first 3 rows)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    if ((rows[i][0] || "").toString().trim().toUpperCase() === "FECHA") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 0;

  const result: MovimientoSocio[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const fecha = (row[0] || "").toString().trim();
    const quien = (row[1] || "").toString().trim();
    const local = (row[2] || "").toString().trim();
    const valorPesosStr = (row[3] || "").toString().trim();
    const valorDolarStr = (row[4] || "").toString().trim();
    const caja = (row[5] || "").toString().trim();
    const medioPago = (row[6] || "").toString().trim();
    const comoSeImputa = (row[7] || "").toString().trim();

    // Skip rows that don't have a valid socio name (probably section divider / summary rows)
    if (!quien || quien.length < 2) continue;

    const fechaISO = parseDate(fecha);

    result.push({
      rowIdx: i + 1, // 1-indexed row in sheet
      fecha,
      fechaISO,
      quien,
      local,
      valorPesos: parseArs(valorPesosStr),
      valorDolar: parseArs(valorDolarStr),
      caja,
      medioPago,
      comoSeImputa,
    });
  }
  return result;
}

function buildSocioSummaries(movs: MovimientoSocio[]): SocioSummary[] {
  const map = new Map<string, SocioSummary>();
  for (const m of movs) {
    const key = normalizeSocio(m.quien);
    if (!key) continue;
    let s = map.get(key);
    if (!s) {
      s = {
        socio: m.quien, // primer formato visto
        totalPesos: 0,
        totalDolar: 0,
        porSucursal: {},
        porCaja: {},
        porMedioPago: {},
        count: 0,
        movimientos: [],
      };
      map.set(key, s);
    }
    s.totalPesos += m.valorPesos;
    s.totalDolar += m.valorDolar;
    s.count += 1;
    s.movimientos.push(m);

    const sucKey = m.local || "—";
    if (!s.porSucursal[sucKey]) s.porSucursal[sucKey] = { pesos: 0, dolar: 0, count: 0 };
    s.porSucursal[sucKey].pesos += m.valorPesos;
    s.porSucursal[sucKey].dolar += m.valorDolar;
    s.porSucursal[sucKey].count += 1;

    const cajaKey = m.caja || "—";
    if (!s.porCaja[cajaKey]) s.porCaja[cajaKey] = { pesos: 0, dolar: 0, count: 0 };
    s.porCaja[cajaKey].pesos += m.valorPesos;
    s.porCaja[cajaKey].dolar += m.valorDolar;
    s.porCaja[cajaKey].count += 1;

    const mpKey = m.medioPago || "—";
    if (!s.porMedioPago[mpKey]) s.porMedioPago[mpKey] = { pesos: 0, dolar: 0, count: 0 };
    s.porMedioPago[mpKey].pesos += m.valorPesos;
    s.porMedioPago[mpKey].dolar += m.valorDolar;
    s.porMedioPago[mpKey].count += 1;
  }
  // sort each socio's movements by fecha desc (most recent first)
  const summaries = Array.from(map.values());
  summaries.forEach((s) => {
    s.movimientos.sort((a, b) => {
      const aD = a.fechaISO || "";
      const bD = b.fechaISO || "";
      return bD.localeCompare(aD);
    });
  });
  return summaries.sort((a, b) => b.totalPesos - a.totalPesos);
}

export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "efectivo");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from"); // YYYY-MM-DD
    const to = url.searchParams.get("to");     // YYYY-MM-DD

    const rows = await readSheetRaw(SHEET_ID, `'${TAB}'!A1:H1000`);
    const all = parseRows(rows);

    // Filter by date range (inclusive). Rows without fechaISO get excluded if filter active.
    let filtered = all;
    if (from || to) {
      filtered = all.filter((m) => {
        if (!m.fechaISO) return false;
        if (from && m.fechaISO < from) return false;
        if (to && m.fechaISO > to) return false;
        return true;
      });
    }

    const porSocio = buildSocioSummaries(filtered);

    // Aggregate global stats
    const totalPesos = filtered.reduce((s, m) => s + m.valorPesos, 0);
    const totalDolar = filtered.reduce((s, m) => s + m.valorDolar, 0);
    const sucursalesSet = new Set<string>();
    const cajasSet = new Set<string>();
    const mediosSet = new Set<string>();
    const sociosSet = new Set<string>();
    for (const m of all) {
      if (m.local) sucursalesSet.add(m.local);
      if (m.caja) cajasSet.add(m.caja);
      if (m.medioPago) mediosSet.add(m.medioPago);
      if (m.quien) sociosSet.add(m.quien);
    }

    return NextResponse.json({
      from: from || null,
      to: to || null,
      total: filtered.length,
      totalGeneral: all.length,
      totalPesos,
      totalDolar,
      porSocio,
      sucursales: Array.from(sucursalesSet).sort(),
      cajas: Array.from(cajasSet).sort(),
      mediosPago: Array.from(mediosSet).sort(),
      socios: Array.from(sociosSet).sort(),
    });
  } catch (e) {
    console.error("efectivo-y-mas GET error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "efectivo");
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      fecha,        // YYYY-MM-DD o DD/MM/YYYY
      quien,
      local,
      valorPesos,
      valorDolar,
      caja,
      medioPago,
      comoSeImputa,
    } = body as {
      fecha: string;
      quien: string;
      local: string;
      valorPesos: number | string;
      valorDolar?: number | string;
      caja: string;
      medioPago: string;
      comoSeImputa?: string;
    };

    if (!fecha || !quien || !local) {
      return NextResponse.json({ error: "fecha, quien y local son requeridos" }, { status: 400 });
    }

    // Normalizar fecha al formato del sheet (D/M/YYYY)
    let fechaSheet = fecha;
    const iso = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      fechaSheet = `${parseInt(iso[3])}/${parseInt(iso[2])}/${iso[1]}`;
    }

    const pesos = typeof valorPesos === "string" ? parseFloat(valorPesos) || 0 : valorPesos;
    const dolar = valorDolar !== undefined && valorDolar !== null && valorDolar !== ""
      ? (typeof valorDolar === "string" ? parseFloat(valorDolar) || 0 : valorDolar)
      : 0;

    const row: (string | number)[] = [
      fechaSheet,
      quien.trim(),
      local.trim().toUpperCase(),
      pesos > 0 ? pesos : "",
      dolar > 0 ? dolar : "",
      (caja || "").trim().toUpperCase(),
      (medioPago || "").trim().toUpperCase(),
      (comoSeImputa || "").trim(),
    ];

    const updated = await appendToSheet(SHEET_ID, `'${TAB}'!A:H`, [row]);

    return NextResponse.json({
      success: true,
      rowAppended: updated,
      added: {
        fecha: fechaSheet,
        quien: quien.trim(),
        local: local.trim().toUpperCase(),
        valorPesos: pesos,
        valorDolar: dolar,
        caja: caja || "",
        medioPago: medioPago || "",
        comoSeImputa: comoSeImputa || "",
      },
    });
  } catch (e) {
    console.error("efectivo-y-mas POST error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
