import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { loadSucursalRows, SUCURSALES, Sucursal } from "@/lib/deuda-locales";
import { parseDate } from "@/lib/google";

export const runtime = "nodejs";

// Keywords default que disparan match "gastos de oficina"
const KEYWORDS_DEFAULT = [
  "oficina",
  "overhead",
  "gastos de oficina",
  "gasto de oficina",
];

interface Mov {
  sucursal: Sucursal;
  rownum: number;
  fecha: string;          // formato original sheet
  fechaISO: string | null;
  fechaPago: string | null;
  proveedor: string;
  rubro: string;
  insumo: string;
  total: number;
  metodoPago: string;
  estadoPago: "pagado" | "pendiente";
  matchedBy: string;      // qué keyword matchó
}

function detectMatch(
  rubro: string,
  insumo: string,
  proveedor: string,
  searchTerms: string[]
): string | null {
  const hay = `${rubro} ${insumo} ${proveedor}`.toLowerCase();
  for (const term of searchTerms) {
    const t = term.toLowerCase().trim();
    if (!t) continue;
    if (hay.includes(t)) return term;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "egresos");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") || "2026";
    const from = url.searchParams.get("from");   // YYYY-MM-DD
    const to = url.searchParams.get("to");       // YYYY-MM-DD
    const searchParam = url.searchParams.get("search") || "";
    const includeDefaults = url.searchParams.get("includeDefaults") !== "false"; // por defecto true

    // Construir lista de keywords a usar
    const extraTerms = searchParam
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const searchTerms = [
      ...(includeDefaults ? KEYWORDS_DEFAULT : []),
      ...extraTerms,
    ];

    if (searchTerms.length === 0) {
      return NextResponse.json({
        error: "Se requiere al menos un término de búsqueda o usar los defaults",
      }, { status: 400 });
    }

    // Cargar EGRESOS de las 3 sucursales en paralelo
    const [palermo, belgrano, madero] = await Promise.all([
      loadSucursalRows("palermo", year),
      loadSucursalRows("belgrano", year),
      loadSucursalRows("madero", year),
    ]);
    const allRows = [...palermo, ...belgrano, ...madero];

    // Filtrar por keywords + fecha
    const movs: Mov[] = [];
    for (const r of allRows) {
      const matchedBy = detectMatch(r.rubro, r.insumo, r.proveedor, searchTerms);
      if (!matchedBy) continue;

      const fechaRaw = r.fechaFC || r.fechaIng;
      const fechaISO = parseDate(fechaRaw);

      // Filtro de fechas
      if (from || to) {
        if (!fechaISO) continue;
        if (from && fechaISO < from) continue;
        if (to && fechaISO > to) continue;
      }

      const estadoPago: "pagado" | "pendiente" =
        r.fechaPago && r.metodoPago && !["sin pagar", "pendiente"].includes(r.metodoPago.toLowerCase())
          ? "pagado"
          : "pendiente";

      movs.push({
        sucursal: r.sucursal,
        rownum: r.rownum,
        fecha: fechaRaw,
        fechaISO,
        fechaPago: r.fechaPago,
        proveedor: r.proveedor,
        rubro: r.rubro,
        insumo: r.insumo,
        total: r.total,
        metodoPago: r.metodoPago,
        estadoPago,
        matchedBy,
      });
    }

    // Sort por fecha desc
    movs.sort((a, b) => (b.fechaISO || "").localeCompare(a.fechaISO || ""));

    // Stats por sucursal
    const porSucursal: Record<Sucursal, { total: number; pagado: number; pendiente: number; count: number }> = {
      palermo: { total: 0, pagado: 0, pendiente: 0, count: 0 },
      belgrano: { total: 0, pagado: 0, pendiente: 0, count: 0 },
      madero: { total: 0, pagado: 0, pendiente: 0, count: 0 },
    };
    for (const m of movs) {
      porSucursal[m.sucursal].total += m.total;
      porSucursal[m.sucursal].count += 1;
      if (m.estadoPago === "pagado") porSucursal[m.sucursal].pagado += m.total;
      else porSucursal[m.sucursal].pendiente += m.total;
    }

    // Stats por rubro (top categorias)
    const porRubro: Record<string, { total: number; count: number; porSucursal: Record<Sucursal, number> }> = {};
    for (const m of movs) {
      const key = m.rubro || "(sin rubro)";
      if (!porRubro[key]) {
        porRubro[key] = {
          total: 0,
          count: 0,
          porSucursal: { palermo: 0, belgrano: 0, madero: 0 },
        };
      }
      porRubro[key].total += m.total;
      porRubro[key].count += 1;
      porRubro[key].porSucursal[m.sucursal] += m.total;
    }

    // Stats por proveedor (top)
    const porProveedor: Record<string, { total: number; count: number }> = {};
    for (const m of movs) {
      const key = m.proveedor || "(sin proveedor)";
      if (!porProveedor[key]) porProveedor[key] = { total: 0, count: 0 };
      porProveedor[key].total += m.total;
      porProveedor[key].count += 1;
    }

    // Lista de rubros y proveedores que aparecen en TODOS los EGRESOS (no solo los matcheados) — útil para que el usuario explore qué keywords agregar
    const allRubrosSet = new Set<string>();
    const allProveedoresSet = new Set<string>();
    for (const r of allRows) {
      if (r.rubro) allRubrosSet.add(r.rubro);
      if (r.proveedor) allProveedoresSet.add(r.proveedor);
    }

    return NextResponse.json({
      year,
      from: from || null,
      to: to || null,
      searchTerms,
      total: movs.length,
      totalMonto: movs.reduce((s, m) => s + m.total, 0),
      porSucursal,
      porRubro: Object.entries(porRubro)
        .map(([rubro, v]) => ({ rubro, ...v }))
        .sort((a, b) => b.total - a.total),
      porProveedor: Object.entries(porProveedor)
        .map(([proveedor, v]) => ({ proveedor, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 30),
      movimientos: movs,
      // listado completo para exploración (limitado a 200 más populares)
      todosLosRubros: Array.from(allRubrosSet).sort(),
      todosLosProveedores: Array.from(allProveedoresSet).sort(),
      sucursales: [...SUCURSALES],
    });
  } catch (e) {
    console.error("oficina GET error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
