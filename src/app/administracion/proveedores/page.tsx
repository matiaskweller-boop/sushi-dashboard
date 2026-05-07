"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

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
  centralizado?: boolean;
  centralizadoCount?: number;
  centralizadoMontoExtra?: number;
}

interface InterSucursalSummary {
  saldosNetos: Array<{ deudor: string; acreedor: string; monto: number }>;
  totalMovimientos: number;
  totalMonto: number;
  totalSinDireccion: number;
  totalCentralizadosCount: number;
  montoCentralizadosDuplicado: number;
}

interface ApiResponse {
  year: string;
  proveedores: ProveedorMaster[];
  total: number;
  conDeuda: number;
  totalDeuda: number;
  totalDeuda2026: number;
  totalDeuda2025: number;
  plazos: Record<string, number>;
  porSucursal: Record<string, { totalDeuda: number; conDeuda: number }>;
  interSucursal: InterSucursalSummary | null;
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

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
function fmtK(n: number): string {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}

export default function ProveedoresPage() {
  const [year] = useState<"2026">("2026");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "conDeuda" | "sinDeuda">("conDeuda");
  const [soloDuplicados, setSoloDuplicados] = useState(false);
  const [plazoFilter, setPlazoFilter] = useState<string>("");
  const [bancoFilter, setBancoFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/erp/proveedores?year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.proveedores.filter((p) => {
      if (filtro === "conDeuda" && p.totalDeuda <= 0) return false;
      if (filtro === "sinDeuda" && p.totalDeuda > 0) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${p.proveedor} ${p.razonSocial} ${p.alias} ${p.cbu} ${p.producto} ${p.banco} ${p.agendado}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (plazoFilter && (p.plazoPago || "").toLowerCase().trim() !== plazoFilter.toLowerCase()) return false;
      if (bancoFilter && !(p.banco || "").toUpperCase().includes(bancoFilter.toUpperCase())) return false;
      if (soloDuplicados && !p.centralizado) return false;
      return true;
    });
  }, [data, filtro, search, plazoFilter, bancoFilter, soloDuplicados]);

  const filteredTotal = useMemo(() => filtered.reduce((s, p) => s + p.totalDeuda, 0), [filtered]);

  const plazoOptions = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.plazos).sort(([, a], [, b]) => b - a).map(([k]) => k);
  }, [data]);

  const bancoOptions = useMemo(() => {
    if (!data) return [];
    const banks = new Set<string>();
    data.proveedores.forEach((p) => {
      const b = (p.banco || "").trim();
      if (b) banks.add(b.split(" ")[0].toUpperCase()); // Tomar la primera palabra
    });
    return Array.from(banks).sort();
  }, [data]);

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Proveedores · Master {year}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Lectura de tab DEUDA AL DIA · CBUs, alias, plazos de pago · deuda agregada de las 3 sucursales
        </p>
      </div>

      {loading && <div className="text-center py-20 text-gray-400">Cargando proveedores...</div>}
      {error && <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-4">Error: {error}</div>}

      {data && !loading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Proveedores</div>
              <div className="text-2xl font-bold text-navy">{data.total}</div>
              <div className="text-xs text-gray-400 mt-1">{data.conDeuda} con deuda</div>
            </div>
            <div className="bg-white rounded-xl border border-red-100 p-4">
              <div className="text-xs text-red-600 uppercase tracking-wide mb-1">Deuda total</div>
              <div className="text-2xl font-bold text-red-700">{fmt(data.totalDeuda)}</div>
              <div className="text-xs text-gray-400 mt-1">3 sucursales sumadas</div>
            </div>
            {Object.entries(data.porSucursal).map(([suc, d]) => (
              <div key={suc} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: SUC_COLORS[suc] }}>
                  {SUC_NAMES[suc]}
                </div>
                <div className="text-xl font-bold text-navy">{fmtK(d.totalDeuda)}</div>
                <div className="text-xs text-gray-400 mt-1">{d.conDeuda} proveedores</div>
              </div>
            ))}
          </div>

          {/* Inter-Sucursal Summary */}
          {data.interSucursal && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-navy uppercase tracking-wide">
                  🔁 Movimientos entre locales {data.year}
                </h2>
                <Link href="/administracion/deuda-locales" className="text-xs text-blue-accent hover:underline">
                  Ver detalle completo →
                </Link>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-[10px] text-gray-500 uppercase">Movimientos</div>
                  <div className="text-lg font-bold text-navy">{data.interSucursal.totalMovimientos}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{fmt(data.interSucursal.totalMonto)}</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <div className="text-[10px] text-amber-700 uppercase">Sin contraparte</div>
                  <div className="text-lg font-bold text-amber-700">{fmt(data.interSucursal.totalSinDireccion)}</div>
                  <div className="text-xs text-amber-600 mt-0.5">uber/envíos genéricos</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <div className="text-[10px] text-red-700 uppercase">Servicios duplicados</div>
                  <div className="text-lg font-bold text-red-700">{fmt(data.interSucursal.montoCentralizadosDuplicado)}</div>
                  <div className="text-xs text-red-600 mt-0.5">{data.interSucursal.totalCentralizadosCount} grupos</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-[10px] text-blue-accent uppercase">Saldos netos</div>
                  <div className="text-lg font-bold text-blue-accent">{data.interSucursal.saldosNetos.length}</div>
                  <div className="text-xs text-blue-accent mt-0.5">deudas inter-sucursal</div>
                </div>
              </div>

              {data.interSucursal.saldosNetos.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-600 uppercase">Saldos netos</div>
                  {data.interSucursal.saldosNetos.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-gray-500">debe</span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-md text-white"
                        style={{ backgroundColor: SUC_COLORS[s.deudor] }}
                      >
                        {SUC_NAMES[s.deudor]}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-md text-white"
                        style={{ backgroundColor: SUC_COLORS[s.acreedor] }}
                      >
                        {SUC_NAMES[s.acreedor]}
                      </span>
                      <span className="ml-auto font-mono font-bold text-red-700">{fmt(s.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4 flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Buscar nombre, alias, CBU, producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[260px]"
            />
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
              {([
                { id: "conDeuda", label: "Con deuda" },
                { id: "sinDeuda", label: "Sin deuda" },
                { id: "todos", label: "Todos" },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFiltro(opt.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    filtro === opt.id ? "bg-white shadow text-navy" : "text-gray-500 hover:text-navy"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <select
              value={plazoFilter}
              onChange={(e) => setPlazoFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos los plazos</option>
              {plazoOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={bancoFilter}
              onChange={(e) => setBancoFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos los bancos</option>
              {bancoOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 cursor-pointer">
              <input type="checkbox" checked={soloDuplicados} onChange={(e) => setSoloDuplicados(e.target.checked)} className="cursor-pointer" />
              <span>🔁 solo duplicados</span>
            </label>
            {(search || plazoFilter || bancoFilter || filtro !== "conDeuda" || soloDuplicados) && (
              <button
                onClick={() => { setSearch(""); setPlazoFilter(""); setBancoFilter(""); setFiltro("conDeuda"); setSoloDuplicados(false); }}
                className="text-xs text-red-500 hover:underline"
              >
                Limpiar
              </button>
            )}
            <span className="text-xs text-gray-400 ml-auto">
              {filtered.length} de {data.total} · {fmt(filteredTotal)} de deuda
            </span>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Producto</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Plazo</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-blue-700 uppercase" style={{ color: SUC_COLORS.palermo }}>Palermo</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase" style={{ color: SUC_COLORS.belgrano }}>Belgrano</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase" style={{ color: SUC_COLORS.madero }}>Madero</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-red-600 uppercase">Total</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">Alias</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase">CBU</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const isExpanded = expanded === p.proveedor;
                    return (
                      <>
                        <tr
                          key={p.proveedor}
                          onClick={() => setExpanded(isExpanded ? null : p.proveedor)}
                          className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${p.totalDeuda > 0 ? "bg-red-50/20" : ""}`}
                        >
                          <td className="px-3 py-2.5 font-medium text-navy">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-gray-400 text-xs">{isExpanded ? "▼" : "▶"}</span>
                              <span>{p.proveedor}</span>
                              {p.centralizado && (
                                <span
                                  title={`Servicio centralizado: ${p.centralizadoCount} grupos duplicados, ${fmt(p.centralizadoMontoExtra || 0)} de gasto extra en P&L consolidado`}
                                  className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium"
                                >
                                  🔁 {p.centralizadoCount}× duplicado
                                </span>
                              )}
                            </div>
                            {p.razonSocial && p.razonSocial.toUpperCase() !== p.proveedor.toUpperCase() && (
                              <div className="text-xs text-gray-400 ml-3 truncate max-w-[180px]" title={p.razonSocial}>{p.razonSocial}</div>
                            )}
                            {p.centralizado && (p.centralizadoMontoExtra || 0) > 0 && (
                              <div className="text-[10px] text-amber-600 ml-3 mt-0.5">
                                +{fmt(p.centralizadoMontoExtra || 0)} duplicado en P&L
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs max-w-[160px] truncate" title={p.producto}>{p.producto || "—"}</td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{p.plazoPago || "—"}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {(p.porSucursal.palermo?.total || 0) > 0 ? <span className="text-red-600">{fmtK(p.porSucursal.palermo.total)}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {(p.porSucursal.belgrano?.total || 0) > 0 ? <span className="text-red-600">{fmtK(p.porSucursal.belgrano.total)}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {(p.porSucursal.madero?.total || 0) > 0 ? <span className="text-red-600">{fmtK(p.porSucursal.madero.total)}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold">
                            {p.totalDeuda > 0 ? <span className="text-red-700">{fmt(p.totalDeuda)}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {p.alias ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(p.alias, `alias-${p.proveedor}`); }}
                                className="text-blue-accent hover:underline font-mono"
                                title="Click para copiar"
                              >
                                {copied === `alias-${p.proveedor}` ? "✓ copiado" : p.alias.substring(0, 18) + (p.alias.length > 18 ? "…" : "")}
                              </button>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {p.cbu ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(p.cbu, `cbu-${p.proveedor}`); }}
                                className="text-blue-accent hover:underline font-mono"
                                title="Click para copiar"
                              >
                                {copied === `cbu-${p.proveedor}` ? "✓ copiado" : "..." + p.cbu.slice(-8)}
                              </button>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <td colSpan={9} className="px-6 py-4">
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
                                {/* Datos comerciales */}
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Datos comerciales</div>
                                  <div className="space-y-1 text-xs">
                                    <div><span className="text-gray-500">Razón social:</span> <span className="text-navy">{p.razonSocial || "—"}</span></div>
                                    <div><span className="text-gray-500">Producto:</span> <span className="text-navy">{p.producto || "—"}</span></div>
                                    <div><span className="text-gray-500">Plazo de pago:</span> <span className="text-navy">{p.plazoPago || "—"}</span></div>
                                    <div><span className="text-gray-500">Agendado:</span> <span className="text-navy">{p.agendado || "—"}</span></div>
                                    {p.aclaracion && <div><span className="text-gray-500">Aclaración:</span> <span className="text-navy">{p.aclaracion}</span></div>}
                                  </div>
                                </div>

                                {/* Banking info */}
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Banco</div>
                                  <div className="space-y-1 text-xs">
                                    <div><span className="text-gray-500">Banco:</span> <span className="text-navy">{p.banco || "—"}</span></div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">Alias:</span>
                                      {p.alias ? (
                                        <button
                                          onClick={() => copyToClipboard(p.alias, `e-alias-${p.proveedor}`)}
                                          className="font-mono text-navy hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors"
                                        >
                                          {p.alias} {copied === `e-alias-${p.proveedor}` ? "✓" : "📋"}
                                        </button>
                                      ) : <span className="text-gray-300">—</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">CBU:</span>
                                      {p.cbu ? (
                                        <button
                                          onClick={() => copyToClipboard(p.cbu, `e-cbu-${p.proveedor}`)}
                                          className="font-mono text-navy hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors text-[11px]"
                                        >
                                          {p.cbu} {copied === `e-cbu-${p.proveedor}` ? "✓" : "📋"}
                                        </button>
                                      ) : <span className="text-gray-300">—</span>}
                                    </div>
                                  </div>
                                </div>

                                {/* Deuda detalle */}
                                <div>
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Deuda por sucursal</div>
                                  <div className="space-y-1.5 text-xs">
                                    {(["palermo", "belgrano", "madero"] as const).map((suc) => {
                                      const d = p.porSucursal[suc];
                                      if (!d) return null;
                                      return (
                                        <div key={suc} className="flex items-center justify-between">
                                          <span style={{ color: SUC_COLORS[suc] }} className="font-medium">{SUC_NAMES[suc]}</span>
                                          <span className={`font-mono ${d.total > 0 ? "text-red-600" : "text-gray-400"}`}>
                                            {d.total > 0 ? fmt(d.total) : "—"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-200 font-semibold">
                                      <span className="text-navy">Total</span>
                                      <span className={`font-mono ${p.totalDeuda > 0 ? "text-red-700" : "text-gray-400"}`}>
                                        {p.totalDeuda > 0 ? fmt(p.totalDeuda) : "—"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No hay proveedores que coincidan con los filtros
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 mt-3">
            Click en una fila para expandir · click en alias o CBU para copiar
          </div>
        </>
      )}
    </div>
  );
}
