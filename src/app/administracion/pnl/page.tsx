"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";

type Categoria =
  | "insumos"
  | "sueldos"
  | "alquilerServicios"
  | "operativos"
  | "financieros"
  | "impuestos"
  | "otros";

interface PnLMonth {
  year: number;
  month: number;
  ventas: number;
  ordenes: number;
  comensales: number;
  ticketPromedio: number;
  costos: {
    insumos: number;
    sueldos: number;
    alquilerServicios: number;
    operativos: number;
    financieros: number;
    impuestos: number;
    otros: number;
    total: number;
  };
  margenBruto: number;
  cmvPct: number;
  ebitda: number;
  ebitdaPct: number;
}

interface RubroBreakdown {
  rubro: string;
  categoria: Categoria;
  categoriaDefault: Categoria;
  isOverride: boolean;
  total: number;
  facturas: number;
  byMonth: Record<number, number>;
}

interface PnLResponse {
  sucursal: string;
  year: string;
  months: PnLMonth[];
  ytd: {
    ventas: number;
    ordenes: number;
    comensales: number;
    costosInsumos: number;
    costosSueldos: number;
    costosAlquilerServicios: number;
    costosOperativos: number;
    costosFinancieros: number;
    costosImpuestos: number;
    costosOtros: number;
    costosTotal: number;
    ebitda: number;
    cmvPct: number;
    ebitdaPct: number;
  };
  byRubro: RubroBreakdown[];
}

const SUC_NAMES: Record<string, string> = {
  palermo: "Palermo",
  belgrano: "Belgrano",
  madero: "Madero",
};
const SUC_COLORS: Record<string, string> = {
  palermo: "#2E6DA4",
  belgrano: "#10B981",
  madero: "#8B5CF6",
};
const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const CATEGORIAS: Categoria[] = ["insumos", "sueldos", "alquilerServicios", "operativos", "impuestos", "financieros", "otros"];

const CATEGORIA_LABEL: Record<Categoria, string> = {
  insumos: "Insumos / CMV",
  sueldos: "Sueldos / RRHH",
  alquilerServicios: "Alquiler + Servicios",
  operativos: "Operativos",
  financieros: "Bancarios / Comisiones",
  impuestos: "Impuestos / Acuerdos",
  otros: "Otros",
};
const CATEGORIA_COLOR: Record<Categoria, string> = {
  insumos: "#EF4444",
  sueldos: "#F59E0B",
  alquilerServicios: "#8B5CF6",
  operativos: "#06B6D4",
  financieros: "#EC4899",
  impuestos: "#6366F1",
  otros: "#64748B",
};

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}
function fmtPct(n: number): string {
  return n.toFixed(1) + "%";
}

export default function PnLPage() {
  const [year, setYear] = useState<"2025" | "2026">("2026");
  const [sucursal, setSucursal] = useState<string>("palermo");
  const [data, setData] = useState<PnLResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [savingRubro, setSavingRubro] = useState<string | null>(null);
  const [searchRubro, setSearchRubro] = useState("");
  const [filterCat, setFilterCat] = useState<Categoria | "">("");
  const [expandedRubro, setExpandedRubro] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/erp/pnl?sucursal=${sucursal}&year=${year}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sucursal, year]);

  const reassignRubro = async (rubro: string, categoria: Categoria) => {
    setSavingRubro(rubro);
    try {
      const res = await fetch("/api/erp/rubro-categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubro, categoria }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      await fetchData();
    } catch (e) {
      alert("Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setSavingRubro(null);
    }
  };

  const resetRubroOverride = async (rubro: string) => {
    setSavingRubro(rubro);
    try {
      const res = await fetch(`/api/erp/rubro-categorias?rubro=${encodeURIComponent(rubro)}`, { method: "DELETE" });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      await fetchData();
    } catch (e) {
      alert("Error: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setSavingRubro(null);
    }
  };

  // Chart data
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.months.map((m) => ({
      month: MONTH_NAMES[m.month - 1],
      ventas: m.ventas,
      insumos: m.costos.insumos,
      sueldos: m.costos.sueldos,
      alquilerServicios: m.costos.alquilerServicios,
      operativos: m.costos.operativos,
      financieros: m.costos.financieros,
      impuestos: m.costos.impuestos,
      otros: m.costos.otros,
      ebitda: m.ebitda,
      ebitdaPct: m.ebitdaPct,
      margenBruto: m.margenBruto,
    }));
  }, [data]);

  const selectedMonthData = useMemo(() => {
    if (!data || selectedMonth === null) return null;
    return data.months.find((m) => m.month === selectedMonth) || null;
  }, [data, selectedMonth]);

  const filteredRubros = useMemo(() => {
    if (!data) return [];
    return data.byRubro.filter((r) => {
      if (filterCat && r.categoria !== filterCat) return false;
      if (searchRubro && !r.rubro.toLowerCase().includes(searchRubro.toLowerCase())) return false;
      return true;
    });
  }, [data, filterCat, searchRubro]);

  const filteredTotal = useMemo(() => filteredRubros.reduce((s, r) => s + r.total, 0), [filteredRubros]);

  // PDF export
  const exportPDF = async (mode: "detallado" | "resumido") => {
    if (!data) return;
    setExporting(true);
    try {
      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text(`P&L ${mode === "detallado" ? "Detallado" : "Resumido"} · ${SUC_NAMES[sucursal]} · ${year}`, 40, 40);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generado: ${new Date().toLocaleString("es-AR")}`, 40, 56);

      // KPIs
      doc.setFontSize(10);
      doc.setTextColor(0);
      const kpiY = 80;
      doc.text(`Ventas YTD: ${fmt(data.ytd.ventas)}`, 40, kpiY);
      doc.text(`CMV: ${fmtPct(data.ytd.cmvPct)}`, 240, kpiY);
      doc.text(`EBITDA: ${fmt(data.ytd.ebitda)} (${fmtPct(data.ytd.ebitdaPct)})`, 380, kpiY);
      doc.text(`Costos totales: ${fmt(data.ytd.costosTotal)}`, 600, kpiY);

      // Table comun: P&L resumido
      const monthCols = MONTH_NAMES.map((m) => ({ header: m, dataKey: m }));
      const headers = ["Concepto", ...MONTH_NAMES, "Total"];

      const ytdEbitda = data.ytd.ebitda;
      const ytdMargen = data.ytd.ventas - data.ytd.costosInsumos;

      const rowVentas = ["Ventas", ...data.months.map((m) => m.ventas > 0 ? fmtK(m.ventas) : "—"), fmtK(data.ytd.ventas)];
      const rowInsumos = ["- Insumos", ...data.months.map((m) => m.costos.insumos > 0 ? fmtK(m.costos.insumos) : "—"), fmtK(data.ytd.costosInsumos)];
      const rowMargen = ["= Margen Bruto", ...data.months.map((m) => m.ventas > 0 ? fmtK(m.margenBruto) : "—"), fmtK(ytdMargen)];
      const rowSueldos = ["- Sueldos / RRHH", ...data.months.map((m) => m.costos.sueldos > 0 ? fmtK(m.costos.sueldos) : "—"), fmtK(data.ytd.costosSueldos)];
      const rowAlq = ["- Alquiler + Serv", ...data.months.map((m) => m.costos.alquilerServicios > 0 ? fmtK(m.costos.alquilerServicios) : "—"), fmtK(data.ytd.costosAlquilerServicios)];
      const rowOp = ["- Operativos", ...data.months.map((m) => m.costos.operativos > 0 ? fmtK(m.costos.operativos) : "—"), fmtK(data.ytd.costosOperativos)];
      const rowImp = ["- Impuestos", ...data.months.map((m) => m.costos.impuestos > 0 ? fmtK(m.costos.impuestos) : "—"), fmtK(data.ytd.costosImpuestos)];
      const rowFin = ["- Bancarios", ...data.months.map((m) => m.costos.financieros > 0 ? fmtK(m.costos.financieros) : "—"), fmtK(data.ytd.costosFinancieros)];
      const rowOtros = ["- Otros", ...data.months.map((m) => m.costos.otros > 0 ? fmtK(m.costos.otros) : "—"), fmtK(data.ytd.costosOtros)];
      const rowEbitda = ["= EBITDA", ...data.months.map((m) => m.ventas > 0 ? fmtK(m.ebitda) : "—"), fmtK(ytdEbitda)];

      autoTable(doc, {
        head: [headers],
        body: [rowVentas, rowInsumos, rowMargen, rowSueldos, rowAlq, rowOp, rowImp, rowFin, rowOtros, rowEbitda],
        startY: 100,
        styles: { fontSize: 8, cellPadding: 3, halign: "right" },
        columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
        headStyles: { fillColor: [46, 109, 164], textColor: 255 },
        didParseCell: (h) => {
          if (!h.cell.raw) return;
          const text = String(h.cell.raw);
          if (text.startsWith("=") || text === "Ventas") {
            h.cell.styles.fillColor = [240, 245, 255];
            h.cell.styles.fontStyle = "bold";
          }
        },
      });

      // Si es detallado, agregar tabla con todos los rubros
      if (mode === "detallado") {
        // Agrupar por categoría
        const byCat: Record<Categoria, RubroBreakdown[]> = {
          insumos: [], sueldos: [], alquilerServicios: [], operativos: [],
          financieros: [], impuestos: [], otros: [],
        };
        for (const r of data.byRubro) byCat[r.categoria].push(r);

        // Una página por categoría con todos los rubros mensuales
        for (const cat of CATEGORIAS) {
          const items = byCat[cat];
          if (items.length === 0) continue;
          doc.addPage();
          doc.setFontSize(14);
          doc.setTextColor(0);
          doc.text(`${CATEGORIA_LABEL[cat]} · ${SUC_NAMES[sucursal]} ${year}`, 40, 40);
          doc.setFontSize(9);
          const catTotal = items.reduce((s, r) => s + r.total, 0);
          doc.setTextColor(100);
          doc.text(`Total categoría YTD: ${fmt(catTotal)}`, 40, 58);

          const body = items.map((r) => [
            r.rubro || "(sin rubro)",
            ...MONTH_NAMES.map((_, i) => {
              const v = r.byMonth[i + 1] || 0;
              return v > 0 ? fmtK(v) : "";
            }),
            fmtK(r.total),
            String(r.facturas),
          ]);

          autoTable(doc, {
            head: [["Rubro", ...MONTH_NAMES, "Total YTD", "Fact"]],
            body,
            startY: 70,
            styles: { fontSize: 7, cellPadding: 2, halign: "right" },
            columnStyles: { 0: { halign: "left", cellWidth: 130 } },
            headStyles: { fillColor: [46, 109, 164], textColor: 255 },
          });
        }
      }

      doc.save(`PnL-${SUC_NAMES[sucursal]}-${year}-${mode}.pdf`);
    } catch (e) {
      alert("Error generando PDF: " + (e instanceof Error ? e.message : "desconocido"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">P&amp;L · {SUC_NAMES[sucursal]} {year}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Ventas Fudo · Costos pagados (cash real) · Reasignación de rubros persistida en Google Sheets
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {Object.entries(SUC_NAMES).map(([id, name]) => (
            <button
              key={id}
              onClick={() => setSucursal(id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                sucursal === id ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
              }`}
              style={sucursal === id ? { backgroundColor: SUC_COLORS[id] } : {}}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {(["2026", "2025"] as const).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                year === y ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => exportPDF("resumido")}
            disabled={exporting || !data}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-navy hover:bg-blue-50 disabled:opacity-50"
          >
            📄 PDF resumido
          </button>
          <button
            onClick={() => exportPDF("detallado")}
            disabled={exporting || !data}
            className="px-3 py-1.5 bg-navy text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            📄 PDF detallado
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-20 text-gray-400">Cargando...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-4">Error: {error}</div>}

      {data && !loading && (
        <>
          {/* YTD KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Ventas YTD</div>
              <div className="text-xl font-bold text-navy">{fmt(data.ytd.ventas)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.ytd.ordenes.toLocaleString("es-AR")} órdenes</div>
            </div>
            <div className="bg-white rounded-xl border border-red-100 p-4">
              <div className="text-xs text-red-600 uppercase tracking-wide mb-1">Insumos (CMV)</div>
              <div className="text-xl font-bold text-red-700">{fmt(data.ytd.costosInsumos)}</div>
              <div className="text-xs text-gray-400 mt-1">{fmtPct(data.ytd.cmvPct)} de ventas</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Costos totales</div>
              <div className="text-xl font-bold text-navy">{fmt(data.ytd.costosTotal)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.ytd.ventas ? fmtPct((data.ytd.costosTotal / data.ytd.ventas) * 100) : "—"} de ventas</div>
            </div>
            <div className={`bg-white rounded-xl border p-4 ${data.ytd.ebitda >= 0 ? "border-emerald-100" : "border-red-100"}`}>
              <div className={`text-xs uppercase tracking-wide mb-1 ${data.ytd.ebitda >= 0 ? "text-emerald-600" : "text-red-600"}`}>EBITDA</div>
              <div className={`text-xl font-bold ${data.ytd.ebitda >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(data.ytd.ebitda)}</div>
              <div className="text-xs text-gray-400 mt-1">{fmtPct(data.ytd.ebitdaPct)} margen</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Comensales</div>
              <div className="text-xl font-bold text-navy">{data.ytd.comensales.toLocaleString("es-AR")}</div>
              <div className="text-xs text-gray-400 mt-1">
                {data.ytd.comensales > 0 ? fmt(data.ytd.ventas / data.ytd.comensales) : "—"} / persona
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Ventas vs Costos por mes</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} onClick={(d) => {
                  if (d?.activePayload?.[0]?.payload?.month) {
                    const idx = MONTH_NAMES.indexOf(d.activePayload[0].payload.month);
                    setSelectedMonth(idx + 1);
                  }
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ventas" fill={SUC_COLORS[sucursal]} name="Ventas" />
                  <Bar dataKey="insumos" stackId="costos" fill={CATEGORIA_COLOR.insumos} name="Insumos" />
                  <Bar dataKey="sueldos" stackId="costos" fill={CATEGORIA_COLOR.sueldos} name="Sueldos" />
                  <Bar dataKey="alquilerServicios" stackId="costos" fill={CATEGORIA_COLOR.alquilerServicios} name="Alquiler" />
                  <Bar dataKey="operativos" stackId="costos" fill={CATEGORIA_COLOR.operativos} name="Operativos" />
                  <Bar dataKey="impuestos" stackId="costos" fill={CATEGORIA_COLOR.impuestos} name="Impuestos" />
                  <Bar dataKey="financieros" stackId="costos" fill={CATEGORIA_COLOR.financieros} name="Bancarios" />
                  <Bar dataKey="otros" stackId="costos" fill={CATEGORIA_COLOR.otros} name="Otros" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">EBITDA por mes</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number, name: string) => name === "ebitdaPct" ? fmtPct(v) : fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ebitda" stroke="#10B981" strokeWidth={2} name="EBITDA" dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="margenBruto" stroke={SUC_COLORS[sucursal]} strokeWidth={2} name="Margen Bruto" dot={{ r: 3 }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla P&L resumida */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="text-sm font-semibold text-navy">P&amp;L Resumen · {year}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600 uppercase sticky left-0 bg-gray-50">Concepto</th>
                    {MONTH_NAMES.map((m, i) => (
                      <th
                        key={m}
                        className={`text-right px-2 py-2 font-semibold uppercase cursor-pointer hover:bg-gray-100 ${
                          selectedMonth === i + 1 ? "bg-blue-100 text-blue-accent" : "text-gray-600"
                        }`}
                        onClick={() => setSelectedMonth(selectedMonth === i + 1 ? null : i + 1)}
                      >
                        {m}
                      </th>
                    ))}
                    <th className="text-right px-3 py-2 font-semibold text-gray-700 uppercase bg-gray-100">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 bg-blue-50/40">
                    <td className="px-3 py-2 font-semibold text-navy sticky left-0 bg-blue-50/40">Ventas</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-navy">{m.ventas > 0 ? fmtK(m.ventas) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono font-semibold text-navy bg-gray-100">{fmtK(data.ytd.ventas)}</td>
                  </tr>
                  <tr className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-red-700 sticky left-0 bg-white">- Insumos (CMV)</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-red-600">{m.costos.insumos > 0 ? fmtK(m.costos.insumos) : "—"}</td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-red-600 bg-gray-100">{fmtK(data.ytd.costosInsumos)}</td>
                  </tr>
                  <tr className="border-b border-gray-100 bg-gray-50/50 font-semibold">
                    <td className="px-3 py-2 text-navy sticky left-0 bg-gray-50/50">= Margen Bruto</td>
                    {data.months.map((m) => (
                      <td key={m.month} className="text-right px-2 py-2 font-mono text-navy">
                        {m.ventas > 0 ? <span>{fmtK(m.margenBruto)}<span className="text-[10px] text-gray-400 block">{fmtPct(100 - m.cmvPct)}</span></span> : "—"}
                      </td>
                    ))}
                    <td className="text-right px-3 py-2 font-mono text-navy bg-gray-100">{fmtK(data.ytd.ventas - data.ytd.costosInsumos)}</td>
                  </tr>
                  {(["sueldos", "alquilerServicios", "operativos", "impuestos", "financieros", "otros"] as Categoria[]).map((cat) => {
                    const ytdField = `costos${cat.charAt(0).toUpperCase() + cat.slice(1)}` as keyof typeof data.ytd;
                    const ytdValue = data.ytd[ytdField] as number;
                    return (
                      <tr key={cat} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 sticky left-0 bg-white">- {CATEGORIA_LABEL[cat]}</td>
                        {data.months.map((m) => (
                          <td key={m.month} className="text-right px-2 py-2 font-mono text-gray-500">
                            {m.costos[cat] > 0 ? fmtK(m.costos[cat]) : "—"}
                          </td>
                        ))}
                        <td className="text-right px-3 py-2 font-mono text-gray-500 bg-gray-100">{fmtK(ytdValue)}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-emerald-200 bg-emerald-50/40 font-bold">
                    <td className="px-3 py-2.5 text-emerald-700 sticky left-0 bg-emerald-50/40">= EBITDA</td>
                    {data.months.map((m) => (
                      <td key={m.month} className={`text-right px-2 py-2.5 font-mono ${m.ebitda >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {m.ventas > 0 ? (
                          <span>
                            {fmtK(m.ebitda)}
                            <span className="text-[10px] block font-normal">{fmtPct(m.ebitdaPct)}</span>
                          </span>
                        ) : "—"}
                      </td>
                    ))}
                    <td className={`text-right px-3 py-2.5 font-mono bg-emerald-100 ${data.ytd.ebitda >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                      {fmtK(data.ytd.ebitda)}
                      <span className="text-[10px] block font-normal">{fmtPct(data.ytd.ebitdaPct)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle mes seleccionado */}
          {selectedMonthData && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-navy">
                  Detalle · {MONTH_NAMES[selectedMonthData.month - 1]} {year}
                </h2>
                <button onClick={() => setSelectedMonth(null)} className="text-xs text-gray-400 hover:text-navy">✕ cerrar</button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <div className="text-xs text-gray-500">Ventas</div>
                  <div className="text-lg font-semibold text-navy">{fmt(selectedMonthData.ventas)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Órdenes</div>
                  <div className="text-lg font-semibold text-navy">{selectedMonthData.ordenes.toLocaleString("es-AR")}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Ticket promedio</div>
                  <div className="text-lg font-semibold text-navy">{fmt(selectedMonthData.ticketPromedio)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">CMV</div>
                  <div className="text-lg font-semibold text-red-700">{fmtPct(selectedMonthData.cmvPct)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">EBITDA margen</div>
                  <div className={`text-lg font-semibold ${selectedMonthData.ebitdaPct >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {fmtPct(selectedMonthData.ebitdaPct)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TODOS los rubros — con re-asignación */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-navy">Detalle por rubro · {data.byRubro.length} rubros</h2>
                <div className="text-xs text-gray-500 mt-0.5">Click en categoría para re-asignar · click en fila para ver desglose mensual</div>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Buscar rubro..."
                  value={searchRubro}
                  onChange={(e) => setSearchRubro(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-[200px]"
                />
                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value as Categoria | "")}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
                >
                  <option value="">Todas las categorías</option>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
                </select>
                {(searchRubro || filterCat) && (
                  <button onClick={() => { setSearchRubro(""); setFilterCat(""); }} className="text-xs text-red-500 hover:underline">
                    Limpiar
                  </button>
                )}
                <span className="text-xs text-gray-400">
                  {filteredRubros.length} · {fmt(filteredTotal)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600 uppercase">Rubro</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600 uppercase">Categoría</th>
                    {MONTH_NAMES.map((m) => (
                      <th key={m} className="text-right px-2 py-2 font-semibold text-gray-600 uppercase">{m}</th>
                    ))}
                    <th className="text-right px-3 py-2 font-semibold text-gray-700 uppercase bg-gray-100">Total YTD</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-600 uppercase">Fact</th>
                    <th className="text-right px-2 py-2 font-semibold text-gray-600 uppercase">% del cat</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRubros.map((r) => {
                    const isExpanded = expandedRubro === r.rubro;
                    const catTotal = data.byRubro.filter((x) => x.categoria === r.categoria).reduce((s, x) => s + x.total, 0);
                    const pctCat = catTotal > 0 ? (r.total / catTotal) * 100 : 0;
                    return (
                      <tr
                        key={r.rubro}
                        className={`border-b border-gray-50 ${isExpanded ? "bg-blue-50/30" : "hover:bg-gray-50"}`}
                      >
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setExpandedRubro(isExpanded ? null : r.rubro)}
                            className="text-left font-medium text-navy hover:text-blue-accent flex items-center gap-1"
                          >
                            <span className="text-gray-400">{isExpanded ? "▼" : "▶"}</span>
                            <span>{r.rubro || "(sin rubro)"}</span>
                            {r.isOverride && (
                              <span className="text-[10px] bg-blue-50 text-blue-700 px-1 py-0.5 rounded ml-1">★</span>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={r.categoria}
                              onChange={(e) => reassignRubro(r.rubro, e.target.value as Categoria)}
                              disabled={savingRubro === r.rubro}
                              className="text-xs rounded-md px-1.5 py-0.5 font-medium border-0 cursor-pointer"
                              style={{
                                backgroundColor: CATEGORIA_COLOR[r.categoria] + "22",
                                color: CATEGORIA_COLOR[r.categoria],
                              }}
                            >
                              {CATEGORIAS.map((c) => (
                                <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>
                              ))}
                            </select>
                            {savingRubro === r.rubro && <span className="text-[10px] text-gray-400">...</span>}
                            {r.isOverride && (
                              <button
                                onClick={() => resetRubroOverride(r.rubro)}
                                title={`Resetear a default (${CATEGORIA_LABEL[r.categoriaDefault]})`}
                                className="text-[10px] text-gray-400 hover:text-red-500"
                              >
                                ↺
                              </button>
                            )}
                          </div>
                        </td>
                        {MONTH_NAMES.map((_, i) => {
                          const v = r.byMonth[i + 1] || 0;
                          return (
                            <td key={i} className="text-right px-2 py-2 font-mono text-gray-500">
                              {v > 0 ? fmtK(v) : ""}
                            </td>
                          );
                        })}
                        <td className="text-right px-3 py-2 font-mono font-semibold text-navy bg-gray-50">{fmtK(r.total)}</td>
                        <td className="text-right px-2 py-2 text-gray-500">{r.facturas}</td>
                        <td className="text-right px-2 py-2 text-gray-500">{pctCat.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 flex flex-wrap gap-3">
              <span>★ = re-asignado manualmente</span>
              <span>↺ = resetear a clasificación por keyword</span>
              <span>Reasignaciones se guardan en <code className="bg-gray-100 px-1 rounded">MASUNORI_ERP_CONFIG / RubroCategorias</code></span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
