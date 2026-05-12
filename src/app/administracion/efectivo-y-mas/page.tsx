"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";

interface Movimiento {
  rowIdx: number;
  fecha: string;
  fechaISO: string | null;
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
  movimientos: Movimiento[];
}

interface ApiResponse {
  from: string | null;
  to: string | null;
  total: number;
  totalGeneral: number;
  totalPesos: number;
  totalDolar: number;
  porSocio: SocioSummary[];
  sucursales: string[];
  cajas: string[];
  mediosPago: string[];
  socios: string[];
}

const SUC_COLORS: Record<string, string> = {
  PALERMO: "#2E6DA4",
  BELGRANO: "#10B981",
  MADERO: "#8B5CF6",
};

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

function fmtUSD(n: number): string {
  return "US$" + Math.round(n).toLocaleString("en-US");
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(2) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const first = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const last = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  return { from: first, to: last };
}

export default function EfectivoYMasPage() {
  const def = defaultRange();
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSocio, setExpandedSocio] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterSuc, setFilterSuc] = useState<string>("");

  // form state
  const [fFecha, setFFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [fQuien, setFQuien] = useState("");
  const [fLocal, setFLocal] = useState("PALERMO");
  const [fPesos, setFPesos] = useState("");
  const [fDolar, setFDolar] = useState("");
  const [fCaja, setFCaja] = useState("");
  const [fMedioPago, setFMedioPago] = useState("EFECTIVO");
  const [fComoSeImputa, setFComoSeImputa] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    fetch(`/api/erp/efectivo-y-mas?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSocios = useMemo(() => {
    if (!data) return [];
    if (!filterSuc) return data.porSocio;
    return data.porSocio
      .filter((s) => s.porSucursal[filterSuc])
      .map((s) => ({
        ...s,
        totalPesos: s.porSucursal[filterSuc]?.pesos || 0,
        totalDolar: s.porSucursal[filterSuc]?.dolar || 0,
        count: s.porSucursal[filterSuc]?.count || 0,
        movimientos: s.movimientos.filter((m) => m.local === filterSuc),
      }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.totalPesos - a.totalPesos);
  }, [data, filterSuc]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch("/api/erp/efectivo-y-mas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: fFecha,
          quien: fQuien,
          local: fLocal,
          valorPesos: parseFloat(fPesos) || 0,
          valorDolar: parseFloat(fDolar) || 0,
          caja: fCaja,
          medioPago: fMedioPago,
          comoSeImputa: fComoSeImputa,
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setSubmitMsg("✓ Movimiento agregado");
      // reset partial: keep date/local
      setFQuien("");
      setFPesos("");
      setFDolar("");
      setFCaja("");
      setFComoSeImputa("");
      // refresh
      load();
      setTimeout(() => {
        setShowAddForm(false);
        setSubmitMsg(null);
      }, 1500);
    } catch (e2) {
      setSubmitMsg("✗ " + (e2 instanceof Error ? e2.message : "Error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <div className="flex items-start justify-between mt-2 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-navy">Efectivo y más</h1>
            <p className="text-xs text-gray-400 mt-1">
              Retiros y consumos de socios — tab "RETIROS+CONSUMOS SOCIOS" del archivo Efectivo y más
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-blue-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-accent/90 transition"
          >
            {showAddForm ? "✕ Cerrar" : "+ Nuevo movimiento"}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
          <button
            onClick={load}
            className="bg-navy text-white px-4 py-1.5 rounded-lg text-sm hover:bg-navy/90 transition"
          >
            Aplicar
          </button>
          <button
            onClick={() => {
              const d = defaultRange();
              setFrom(d.from);
              setTo(d.to);
            }}
            className="text-xs text-gray-500 hover:text-navy underline"
          >
            mes actual
          </button>
          <button
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getFullYear(), 0, 1);
              setFrom(start.toISOString().slice(0, 10));
              setTo(now.toISOString().slice(0, 10));
            }}
            className="text-xs text-gray-500 hover:text-navy underline"
          >
            año actual
          </button>
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="text-xs text-gray-500 hover:text-navy underline"
          >
            todos
          </button>

          {data && (
            <div className="ml-auto flex gap-2 items-center">
              <span className="text-[11px] text-gray-500 uppercase tracking-wide">Sucursal:</span>
              <select
                value={filterSuc}
                onChange={(e) => setFilterSuc(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-accent"
              >
                <option value="">Todas</option>
                {data.sucursales.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Form de alta */}
      {showAddForm && (
        <div className="bg-white border-2 border-blue-accent rounded-xl p-5 mb-4 shadow-sm">
          <h3 className="text-sm font-semibold text-navy mb-3">Nuevo movimiento</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Fecha *</label>
              <input
                type="date"
                value={fFecha}
                onChange={(e) => setFFecha(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-2">
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Quién hizo *</label>
              <input
                type="text"
                value={fQuien}
                onChange={(e) => setFQuien(e.target.value)}
                required
                placeholder="o escribí el nombre"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-blue-accent"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(() => {
                  const presets = ["MATIAS KWELLER", "VALENTIN TOBAL", "LUCAS TOBAL", "AGUSTIN TOBAL", "ENRICO MARTELLA", "GABRIELA GERENTE"];
                  const merged = Array.from(new Set([
                    ...presets,
                    ...(data?.socios || []).map((s) => s.toUpperCase()),
                  ]));
                  return merged.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFQuien(s)}
                      className={`text-[11px] px-2 py-1 rounded-md border transition ${
                        fQuien.toUpperCase() === s
                          ? "bg-blue-accent text-white border-blue-accent"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-accent hover:text-blue-accent"
                      }`}
                    >
                      {s}
                    </button>
                  ));
                })()}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Local *</label>
              <select
                value={fLocal}
                onChange={(e) => setFLocal(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
              >
                <option value="PALERMO">PALERMO</option>
                <option value="BELGRANO">BELGRANO</option>
                <option value="MADERO">MADERO</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Valor Pesos</label>
              <input
                type="number"
                step="0.01"
                value={fPesos}
                onChange={(e) => setFPesos(e.target.value)}
                placeholder="200000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Valor Dólar</label>
              <input
                type="number"
                step="0.01"
                value={fDolar}
                onChange={(e) => setFDolar(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
              />
            </div>
            <div className="md:col-span-3 lg:col-span-2">
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Caja</label>
              <input
                type="text"
                value={fCaja}
                onChange={(e) => setFCaja(e.target.value)}
                placeholder="o escribí la tuya"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-blue-accent"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(() => {
                  const presets = ["PALERMO", "BELGRANO", "MADERO", "PEZ", "CONSUMO"];
                  const merged = Array.from(new Set([
                    ...presets,
                    ...(data?.cajas || []),
                  ].map((s) => s.toUpperCase())));
                  return merged.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFCaja(c)}
                      className={`text-[11px] px-2 py-1 rounded-md border transition ${
                        fCaja.toUpperCase() === c
                          ? "bg-blue-accent text-white border-blue-accent"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-accent hover:text-blue-accent"
                      }`}
                    >
                      {c}
                    </button>
                  ));
                })()}
                {fCaja && (
                  <button
                    type="button"
                    onClick={() => setFCaja("")}
                    className="text-[11px] px-2 py-1 rounded-md text-gray-400 hover:text-red-500"
                  >
                    ✕ limpiar
                  </button>
                )}
              </div>
            </div>
            <div className="md:col-span-3 lg:col-span-2">
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Medio de Pago</label>
              <input
                type="text"
                value={fMedioPago}
                onChange={(e) => setFMedioPago(e.target.value)}
                placeholder="o escribí el tuyo"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-blue-accent"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(() => {
                  const presets = ["EFECTIVO", "CC", "CASH", "TRANSFERENCIA", "BBVA", "MERCADO PAGO", "CONSUMO"];
                  const merged = Array.from(new Set([
                    ...presets,
                    ...(data?.mediosPago || []),
                  ].map((s) => s.toUpperCase())));
                  return merged.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFMedioPago(m)}
                      className={`text-[11px] px-2 py-1 rounded-md border transition ${
                        fMedioPago.toUpperCase() === m
                          ? "bg-blue-accent text-white border-blue-accent"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-accent hover:text-blue-accent"
                      }`}
                    >
                      {m}
                    </button>
                  ));
                })()}
                {fMedioPago && (
                  <button
                    type="button"
                    onClick={() => setFMedioPago("")}
                    className="text-[11px] px-2 py-1 rounded-md text-gray-400 hover:text-red-500"
                  >
                    ✕ limpiar
                  </button>
                )}
              </div>
            </div>
            <div className="md:col-span-3 lg:col-span-4">
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Cómo se imputa</label>
              <input
                type="text"
                value={fComoSeImputa}
                onChange={(e) => setFComoSeImputa(e.target.value)}
                placeholder="(opcional) — anotación libre"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
              />
            </div>
            <div className="md:col-span-3 lg:col-span-4 flex gap-3 items-center">
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-accent text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-accent/90 transition disabled:opacity-50"
              >
                {submitting ? "Guardando..." : "Guardar"}
              </button>
              {submitMsg && (
                <span className={`text-sm ${submitMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>
                  {submitMsg}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Loading / error */}
      {loading && <p className="text-gray-500">Cargando...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}

      {/* Resumen + cards */}
      {data && !loading && (
        <>
          {/* Stats globales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Movimientos" value={data.total.toString()} sub={`de ${data.totalGeneral} totales`} />
            <StatCard label="Total Pesos" value={fmtK(data.totalPesos)} sub={fmt(data.totalPesos)} />
            <StatCard label="Total Dólar" value={fmtUSD(data.totalDolar)} sub={data.totalDolar === 0 ? "sin USD" : ""} />
            <StatCard label="Socios" value={data.porSocio.length.toString()} sub="con movimientos" />
          </div>

          {/* Cards por socio */}
          {filteredSocios.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
              No hay movimientos en el rango seleccionado.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSocios.map((s) => {
                const isExpanded = expandedSocio === s.socio;
                return (
                  <div
                    key={s.socio}
                    className={`bg-white border rounded-xl p-4 transition-all ${
                      isExpanded ? "md:col-span-2 lg:col-span-3 border-blue-accent shadow-md" : "border-gray-200 hover:border-blue-accent/40 hover:shadow-sm"
                    }`}
                  >
                    <button
                      onClick={() => setExpandedSocio(isExpanded ? null : s.socio)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-navy text-sm uppercase tracking-wide">{s.socio}</h3>
                        <span className="text-xs text-gray-400">
                          {s.count} mov · {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>

                      <div className="mb-3">
                        <div className="text-2xl font-bold text-navy">{fmtK(s.totalPesos)}</div>
                        {s.totalDolar > 0 && (
                          <div className="text-sm text-gray-500">{fmtUSD(s.totalDolar)}</div>
                        )}
                      </div>

                      {/* Mini desglose por sucursal */}
                      <div className="space-y-1">
                        {Object.entries(s.porSucursal)
                          .sort((a, b) => b[1].pesos - a[1].pesos)
                          .map(([suc, v]) => {
                            const color = SUC_COLORS[suc] || "#6b7280";
                            return (
                              <div key={suc} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                                  <span className="text-gray-600">{suc}</span>
                                </div>
                                <span className="font-medium text-gray-700">{fmtK(v.pesos)}</span>
                              </div>
                            );
                          })}
                      </div>
                    </button>

                    {/* Detalle expandido */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        {/* Por caja + por medio */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <h4 className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Por caja</h4>
                            <table className="w-full text-xs">
                              <tbody>
                                {Object.entries(s.porCaja)
                                  .sort((a, b) => b[1].pesos - a[1].pesos)
                                  .map(([k, v]) => (
                                    <tr key={k} className="border-b border-gray-100">
                                      <td className="py-1 text-gray-600">{k}</td>
                                      <td className="py-1 text-right text-gray-500">{v.count}</td>
                                      <td className="py-1 text-right font-medium text-gray-700">{fmtK(v.pesos)}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <h4 className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Por medio de pago</h4>
                            <table className="w-full text-xs">
                              <tbody>
                                {Object.entries(s.porMedioPago)
                                  .sort((a, b) => b[1].pesos - a[1].pesos)
                                  .map(([k, v]) => (
                                    <tr key={k} className="border-b border-gray-100">
                                      <td className="py-1 text-gray-600">{k}</td>
                                      <td className="py-1 text-right text-gray-500">{v.count}</td>
                                      <td className="py-1 text-right font-medium text-gray-700">{fmtK(v.pesos)}</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Tabla detalle movimientos */}
                        <h4 className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">
                          Movimientos ({s.movimientos.length})
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 text-gray-500 uppercase text-[10px]">
                                <th className="px-2 py-2 text-left">Fecha</th>
                                <th className="px-2 py-2 text-left">Local</th>
                                <th className="px-2 py-2 text-right">Pesos</th>
                                <th className="px-2 py-2 text-right">Dólar</th>
                                <th className="px-2 py-2 text-left">Caja</th>
                                <th className="px-2 py-2 text-left">Medio</th>
                                <th className="px-2 py-2 text-left">Imputación</th>
                              </tr>
                            </thead>
                            <tbody>
                              {s.movimientos.map((m, i) => (
                                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                                  <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">{m.fecha}</td>
                                  <td className="px-2 py-1.5">
                                    <span
                                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                                      style={{ background: SUC_COLORS[m.local] || "#6b7280" }}
                                    >
                                      {m.local}
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-medium">{m.valorPesos > 0 ? fmt(m.valorPesos) : "—"}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-500">{m.valorDolar > 0 ? fmtUSD(m.valorDolar) : "—"}</td>
                                  <td className="px-2 py-1.5 text-gray-600">{m.caja}</td>
                                  <td className="px-2 py-1.5 text-gray-600">{m.medioPago}</td>
                                  <td className="px-2 py-1.5 text-gray-500 max-w-xs truncate">{m.comoSeImputa}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold text-navy mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
