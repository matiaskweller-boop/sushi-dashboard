import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { readSheetRaw, parseArs } from "@/lib/google";
import { analyzeDeudaLocales } from "@/lib/deuda-locales";
import { getAllMasterProveedores, buildLookupByName, MasterProveedor } from "@/lib/master-proveedores";

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

interface ProveedorRow {
  proveedor: string;
  deuda2026: number;
  deuda2025: number;
  total: number;
  aclaracion: string;
  alias: string;
  razonSocial: string;
  banco: string;
  cbu: string;
  agendado: string;
  producto: string;
  plazoPago: string;
}

interface ProveedorMaster {
  proveedor: string;
  razonSocial: string;
  alias: string;
  banco: string;
  cbu: string;
  agendado: string;
  producto: string;
  plazoPago: string;
  aclaracion: string;
  porSucursal: Record<string, { deuda2026: number; deuda2025: number; total: number }>;
  totalDeuda: number;
  totalDeuda2026: number;
  totalDeuda2025: number;
  sucursalesConDeuda: number;
  // Datos del análisis de deuda-locales:
  centralizado?: boolean;          // este proveedor aparece en >1 sucursal con mismos montos
  centralizadoMontoExtra?: number; // suma de duplicados detectados
  centralizadoCount?: number;      // cuántas veces se duplicó
  // Datos del MASTER PROVEEDORES (sheet DATOS, tab DATOS PROVEEDORES, cols A-K):
  masterId?: string;
  masterRowIdx?: number;
  cuit?: string;
  nombreFantasiaFormal?: string;
  nroCuentaTradicional?: string;
  cbu2?: string;
  // Campos legacy no persistidos en DATOS (compat con código viejo):
  contacto?: string;
  formaPago?: string;
  titularCuenta?: string;
  mail?: string;
  corroborado?: boolean;
  notas?: string;
}

function parseDeudaRows(rows: string[][]): ProveedorRow[] {
  if (rows.length < 2) return [];

  // Find header row (first row containing "PROVEEDOR")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i].map((c) => (c || "").toString().toUpperCase().trim());
    if (row.some((c) => c === "PROVEEDOR")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const headers = rows[headerIdx].map((c) => (c || "").toString().trim().toUpperCase());
  const findCol = (...names: string[]): number => {
    for (const n of names) {
      const idx = headers.findIndex((h) => h.includes(n.toUpperCase()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colProv = findCol("PROVEEDOR");
  const col2026 = findCol("2026");
  const col2025 = findCol("2025");
  const colTotal = findCol("TOTAL");
  const colAclaracion = findCol("ACLARACION");
  const colAlias = findCol("ALIAS");
  const colRazon = findCol("NOMBRE O R SOCIAL", "RAZON SOCIAL", "NOMBRE");
  const colBanco = findCol("BANCO");
  const colCbu = findCol("CBU");
  const colAgendado = findCol("AGENDADO");
  const colProducto = findCol("PRODUCTO");
  const colPlazo = findCol("PLAZOS DE PAGO", "PLAZO");

  const result: ProveedorRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const proveedor = colProv >= 0 ? (row[colProv] || "").trim() : "";
    if (!proveedor || proveedor.length < 2) continue;

    result.push({
      proveedor,
      deuda2026: col2026 >= 0 ? parseArs(row[col2026] || "") : 0,
      deuda2025: col2025 >= 0 ? parseArs(row[col2025] || "") : 0,
      total: colTotal >= 0 ? parseArs(row[colTotal] || "") : 0,
      aclaracion: colAclaracion >= 0 ? (row[colAclaracion] || "").trim() : "",
      alias: colAlias >= 0 ? (row[colAlias] || "").trim() : "",
      razonSocial: colRazon >= 0 ? (row[colRazon] || "").trim() : "",
      banco: colBanco >= 0 ? (row[colBanco] || "").trim() : "",
      cbu: colCbu >= 0 ? (row[colCbu] || "").trim() : "",
      agendado: colAgendado >= 0 ? (row[colAgendado] || "").trim() : "",
      producto: colProducto >= 0 ? (row[colProducto] || "").trim() : "",
      plazoPago: colPlazo >= 0 ? (row[colPlazo] || "").trim() : "",
    });
  }
  return result;
}

/**
 * Normaliza nombre de proveedor para matching cross-sucursal.
 */
function normalizeProveedor(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ");
}

export async function GET(request: NextRequest) {
  const auth = await requirePermissionApi(request, "proveedores");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const year = url.searchParams.get("year") || "2026";
    const sheets = SHEET_IDS[year];
    if (!sheets) return NextResponse.json({ error: `Año ${year} no configurado` }, { status: 400 });

    // Leer DEUDA AL DIA de las 3 sucursales en paralelo
    const sucursales = ["palermo", "belgrano", "madero"];
    const results = await Promise.all(
      sucursales.map(async (suc) => {
        if (!sheets[suc]) return { sucursal: suc, rows: [] as ProveedorRow[] };
        try {
          const raw = await readSheetRaw(sheets[suc], "DEUDA AL DIA!A1:Z200");
          return { sucursal: suc, rows: parseDeudaRows(raw) };
        } catch (e) {
          console.error(`Error leyendo DEUDA AL DIA ${suc}:`, e);
          return { sucursal: suc, rows: [] as ProveedorRow[] };
        }
      })
    );

    // Agregar todos los proveedores en un master, mergeando por nombre normalizado
    const master: Record<string, ProveedorMaster> = {};

    for (const { sucursal, rows } of results) {
      for (const r of rows) {
        const key = normalizeProveedor(r.proveedor);
        if (!master[key]) {
          master[key] = {
            proveedor: r.proveedor,
            razonSocial: r.razonSocial,
            alias: r.alias,
            banco: r.banco,
            cbu: r.cbu,
            agendado: r.agendado,
            producto: r.producto,
            plazoPago: r.plazoPago,
            aclaracion: r.aclaracion,
            porSucursal: {},
            totalDeuda: 0,
            totalDeuda2026: 0,
            totalDeuda2025: 0,
            sucursalesConDeuda: 0,
          };
        }
        const m = master[key];
        // Llenar campos que esten vacios
        if (!m.razonSocial && r.razonSocial) m.razonSocial = r.razonSocial;
        if (!m.alias && r.alias) m.alias = r.alias;
        if (!m.banco && r.banco) m.banco = r.banco;
        if (!m.cbu && r.cbu) m.cbu = r.cbu;
        if (!m.agendado && r.agendado) m.agendado = r.agendado;
        if (!m.producto && r.producto) m.producto = r.producto;
        if (!m.plazoPago && r.plazoPago) m.plazoPago = r.plazoPago;
        if (!m.aclaracion && r.aclaracion) m.aclaracion = r.aclaracion;

        // Calcular total: si hay TOTAL en la sheet usarlo, sino sumar 2026+2025
        const total = r.total > 0 ? r.total : (r.deuda2026 + r.deuda2025);
        m.porSucursal[sucursal] = {
          deuda2026: r.deuda2026,
          deuda2025: r.deuda2025,
          total,
        };
        m.totalDeuda += total;
        m.totalDeuda2026 += r.deuda2026;
        m.totalDeuda2025 += r.deuda2025;
        if (total > 0) m.sucursalesConDeuda += 1;
      }
    }

    // ─── Enrich con MASTER PROVEEDORES (info adicional + proveedores sin deuda) ───
    let masterList: MasterProveedor[] = [];
    try {
      masterList = await getAllMasterProveedores();
      const lookup = buildLookupByName(masterList);

      // 1. Enriquecer existentes con datos del master (cols A-K de DATOS PROVEEDORES)
      for (const key of Object.keys(master)) {
        const m = master[key];
        const mp = lookup.get(m.proveedor.toUpperCase().trim())
                  || lookup.get(m.razonSocial.toUpperCase().trim());
        if (mp) {
          m.masterId = mp.id;
          m.masterRowIdx = mp.rowIdx;
          if (mp.nombreSociedad) m.razonSocial = mp.nombreSociedad;
          if (mp.aliasCbu) m.alias = mp.aliasCbu;
          if (mp.banco) m.banco = mp.banco;
          if (mp.cbu) m.cbu = mp.cbu;
          if (mp.rubro) m.producto = mp.rubro;
          if (mp.plazoPago) m.plazoPago = mp.plazoPago;
          m.cuit = mp.cuit;
          m.nombreFantasiaFormal = mp.nombreFantasiaFormal;
          m.nroCuentaTradicional = mp.nroCuentaTradicional;
          m.cbu2 = mp.cbu2;
        }
      }

      // 2. Agregar proveedores que solo están en MASTER (sin deuda en ningún sheet)
      for (const mp of masterList) {
        const key = normalizeProveedor(mp.nombreFantasia);
        if (key && !master[key]) {
          master[key] = {
            proveedor: mp.nombreFantasia,
            razonSocial: mp.nombreSociedad,
            alias: mp.aliasCbu,
            banco: mp.banco,
            cbu: mp.cbu,
            agendado: "",
            producto: mp.rubro,
            plazoPago: mp.plazoPago,
            aclaracion: "",
            porSucursal: {},
            totalDeuda: 0,
            totalDeuda2026: 0,
            totalDeuda2025: 0,
            sucursalesConDeuda: 0,
            masterId: mp.id,
            masterRowIdx: mp.rowIdx,
            cuit: mp.cuit,
            nombreFantasiaFormal: mp.nombreFantasiaFormal,
            nroCuentaTradicional: mp.nroCuentaTradicional,
            cbu2: mp.cbu2,
          };
        }
      }
    } catch (e) {
      console.warn("[proveedores] no se pudo cargar master:", e);
    }

    let proveedores = Object.values(master).sort((a, b) => b.totalDeuda - a.totalDeuda);

    // ─── Movimientos explicitos entre locales ───
    // Solo cargamos los movimientos explicitos (PAGO POR GASTO HECHO POR X,
    // envios entre sucursales, fletes). NO hacemos auto-deteccion de
    // "centralizados/duplicados" por nombre+fecha+monto: cada sucursal opera
    // de forma independiente y comparten proveedores pero pagan cada uno
    // su propia factura.
    let interSucursalSummary: {
      saldosNetos: Array<{ deudor: string; acreedor: string; monto: number }>;
      totalMovimientos: number;
      totalMonto: number;
      totalSinDireccion: number;
    } | null = null;

    try {
      const analisis = await analyzeDeudaLocales(year);
      const totalMovimientos = analisis.movimientos.reduce((s, m) => s + m.total, 0);
      interSucursalSummary = {
        saldosNetos: analisis.saldosNetos.map((s) => ({ deudor: s.deudor, acreedor: s.acreedor, monto: s.monto })),
        totalMovimientos: analisis.movimientos.length,
        totalMonto: totalMovimientos,
        totalSinDireccion: analisis.totalSinDireccion,
      };
    } catch (e) {
      console.warn("[proveedores] no se pudo cargar análisis de deuda-locales:", e);
    }

    // Stats globales
    const totalDeuda = proveedores.reduce((s, p) => s + p.totalDeuda, 0);
    const conDeuda = proveedores.filter((p) => p.totalDeuda > 0).length;
    const totalDeuda2026 = proveedores.reduce((s, p) => s + p.totalDeuda2026, 0);
    const totalDeuda2025 = proveedores.reduce((s, p) => s + p.totalDeuda2025, 0);

    // Distribucion de plazos
    const plazos: Record<string, number> = {};
    for (const p of proveedores) {
      const plazo = (p.plazoPago || "sin plazo").toLowerCase().trim();
      plazos[plazo] = (plazos[plazo] || 0) + 1;
    }

    // Por sucursal
    const porSucursal: Record<string, { totalDeuda: number; conDeuda: number }> = {
      palermo: { totalDeuda: 0, conDeuda: 0 },
      belgrano: { totalDeuda: 0, conDeuda: 0 },
      madero: { totalDeuda: 0, conDeuda: 0 },
    };
    for (const p of proveedores) {
      for (const suc of sucursales) {
        const d = p.porSucursal[suc];
        if (!d) continue;
        porSucursal[suc].totalDeuda += d.total;
        if (d.total > 0) porSucursal[suc].conDeuda += 1;
      }
    }

    // Stats del master (sheet DATOS)
    const enMaster = proveedores.filter((p) => p.masterId).length;
    const sinMaster = proveedores.length - enMaster;
    const conCuit = proveedores.filter((p) => p.cuit && p.cuit.length > 5).length;
    const sinCuit = enMaster - conCuit;

    return NextResponse.json({
      year,
      proveedores,
      total: proveedores.length,
      conDeuda,
      totalDeuda,
      totalDeuda2026,
      totalDeuda2025,
      plazos,
      porSucursal,
      interSucursal: interSucursalSummary, // null si falla
      master: {
        totalEnMaster: masterList.length,
        enMaster,
        sinMaster,
        conCuit,
        sinCuit,
      },
    });
  } catch (e) {
    console.error("ERP proveedores error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno" },
      { status: 500 }
    );
  }
}
