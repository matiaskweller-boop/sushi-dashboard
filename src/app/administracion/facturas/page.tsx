"use client";

import { useState, useRef } from "react";
import Link from "next/link";

interface OCRResult {
  proveedor: string;
  razonSocial: string;
  cuit: string;
  fechaFC: string;
  nroComprobante: string;
  tipoComprobante: string;
  subtotal: number;
  iva: number;
  total: number;
  moneda: string;
  rubro: string;
  insumo: string;
  detalleItems: Array<{ descripcion: string; cantidad: number; precioUnitario: number; subtotal: number }>;
  confianza: number;
  notas: string;
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

const RUBROS = [
  "Almacen", "Bebidas c/Alcohol", "Bebidas s/Alcohol", "Postres y Café",
  "Carniceria", "Descartables", "Productos Orientales", "Pescaderia",
  "Verduleria", "Envios", "Alquiler", "Bazar", "Equipamiento", "Farmacia",
  "Honorarios Y Abonos", "Limpieza", "Mantenimiento", "Servicios", "Sueldos",
  "Varios", "Acuerdos", "IIBB", "IVA", "Otros",
];

const TIPOS = ["FAC A", "FAC B", "FAC C", "RECIBO", "NOTA DE CREDITO", "REMITO", "TICKET", "OTRO"];

const METODOS_PAGO = [
  "Sin pagar", "Efectivo Local", "Tarjeta", "Mercado Pago",
  "Bco ST PALERMO", "Bco ST BELGRANO", "Bco ST MADERO", "BBVA",
  "E-CHEQ", "Efectivo Retiro", "Otro",
];

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

export default function FacturasPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [editing, setEditing] = useState<OCRResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sucursal, setSucursal] = useState<string>("palermo");
  const [year, setYear] = useState<"2025" | "2026">("2026");
  const [metodoPago, setMetodoPago] = useState<string>("Sin pagar");
  const [fechaPago, setFechaPago] = useState<string>("");
  const [fechaVto, setFechaVto] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (selectedFile: File) => {
    // Validar tipo
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(jpe?g|png|webp|heic|heif|pdf)$/i)) {
      setError(`Tipo no soportado: ${selectedFile.type || "desconocido"}. Usá JPG, PNG, WebP, HEIC o PDF.`);
      return;
    }
    // Validar tamaño (max 20MB para inline en Gemini)
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError(`Archivo muy grande (${(selectedFile.size / 1024 / 1024).toFixed(1)} MB). Máximo 20 MB.`);
      return;
    }
    setFile(selectedFile);
    setError(null);
    setSuccess(null);
    setOcrResult(null);
    setEditing(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(selectedFile);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const processOCR = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setOcrResult(null);
    setEditing(null);

    try {
      // Convertir a base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // strip "data:image/...;base64,"
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const imageBase64 = await base64Promise;

      const res = await fetch("/api/erp/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type || "image/jpeg" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error OCR");
      setOcrResult(data.data);
      setEditing({ ...data.data });
      // Auto-set fechaVto si tenemos fechaFC y plazo desconocido — usar fechaFC + 7 dias por defecto
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando imagen");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setEditing(null);
    setError(null);
    setSuccess(null);
    setMetodoPago("Sin pagar");
    setFechaPago("");
    setFechaVto("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.proveedor || !editing.total) {
      setError("Falta proveedor o total");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/erp/ocr/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal,
          year,
          proveedor: editing.proveedor,
          fechaFC: editing.fechaFC,
          fechaPago,
          nroComprobante: editing.nroComprobante,
          tipoComprobante: editing.tipoComprobante,
          rubro: editing.rubro,
          insumo: editing.insumo,
          total: editing.total,
          metodoPago,
          fechaVto,
          confianza: editing.confianza,
          notas: editing.notas,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error guardando");
      setSuccess(data.message || "Factura cargada exitosamente");
      // Reset después de 2 segundos
      setTimeout(reset, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof OCRResult>(field: K, value: OCRResult[K]) => {
    if (!editing) return;
    setEditing({ ...editing, [field]: value });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Carga de facturas con OCR</h1>
        <p className="text-xs text-gray-400 mt-1">
          Sacá foto de la factura, Gemini extrae los datos, revisás y se cargan en EGRESOS de la sucursal
        </p>
      </div>

      {/* Sucursal selector arriba */}
      <div className="flex flex-wrap gap-2 mb-4 items-center bg-white border border-gray-200 rounded-xl p-3">
        <span className="text-xs text-gray-500 mr-2">Cargar en:</span>
        <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
          {Object.entries(SUC_NAMES).map(([id, name]) => (
            <button
              key={id}
              onClick={() => setSucursal(id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                sucursal === id ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
              }`}
              style={sucursal === id ? { backgroundColor: SUC_COLORS[id] } : {}}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
          {(["2026", "2025"] as const).map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                year === y ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* IZQUIERDA: upload + preview */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Imagen</h2>

          {!previewUrl ? (
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-accent hover:bg-blue-50/30 transition-all"
            >
              <div className="text-4xl mb-2">📸 📄</div>
              <div className="text-sm text-gray-600 mb-1">Click o arrastrá foto / PDF de la factura</div>
              <div className="text-xs text-gray-400">JPG, PNG, WEBP, HEIC, PDF · max 20MB</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,image/*"
                onChange={onFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div>
              {file?.type === "application/pdf" ? (
                <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50" style={{ height: "500px" }}>
                  <embed src={previewUrl} type="application/pdf" className="w-full h-full" />
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={previewUrl} alt="Factura" className="max-h-[500px] w-full object-contain rounded-lg border border-gray-200" />
              )}
              <div className="text-xs text-gray-400 mt-1 truncate">{file?.name} · {((file?.size || 0) / 1024 / 1024).toFixed(2)} MB · {file?.type || "?"}</div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={processOCR}
                  disabled={loading}
                  className="flex-1 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-accent disabled:opacity-50 transition-all"
                >
                  {loading ? "Procesando con Gemini..." : ocrResult ? "↻ Re-procesar" : "✨ Extraer datos"}
                </button>
                <button
                  onClick={reset}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cambiar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* DERECHA: datos extraídos editables */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Datos extraídos</h2>

          {!editing && !loading && (
            <div className="text-center py-12 text-gray-400 text-sm">
              {file ? "Procesá la imagen para extraer datos" : "Subí una factura primero"}
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="text-4xl mb-2 animate-pulse">🔍</div>
              <div className="text-sm text-gray-500">Gemini está leyendo la factura...</div>
              <div className="text-xs text-gray-400 mt-1">Esto puede tardar 5-15 segundos</div>
            </div>
          )}

          {editing && !loading && (
            <div className="space-y-3 text-sm">
              {/* Confianza */}
              <div className={`rounded-lg p-2 text-xs flex items-center justify-between ${
                editing.confianza >= 80 ? "bg-emerald-50 text-emerald-700" :
                editing.confianza >= 60 ? "bg-amber-50 text-amber-700" :
                "bg-red-50 text-red-700"
              }`}>
                <span>Confianza OCR: <b>{editing.confianza}%</b></span>
                {editing.notas && <span className="text-xs opacity-75 max-w-[60%] truncate">{editing.notas}</span>}
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase">Proveedor</label>
                <input
                  type="text"
                  value={editing.proveedor}
                  onChange={(e) => updateField("proveedor", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium"
                />
                {editing.razonSocial && editing.razonSocial !== editing.proveedor && (
                  <div className="text-xs text-gray-400 mt-1">{editing.razonSocial} · CUIT {editing.cuit || "—"}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Fecha FC</label>
                  <input
                    type="date"
                    value={editing.fechaFC}
                    onChange={(e) => updateField("fechaFC", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Tipo</label>
                  <select
                    value={editing.tipoComprobante}
                    onChange={(e) => updateField("tipoComprobante", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase">Nro comprobante</label>
                <input
                  type="text"
                  value={editing.nroComprobante}
                  onChange={(e) => updateField("nroComprobante", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Rubro</label>
                  <select
                    value={editing.rubro}
                    onChange={(e) => updateField("rubro", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— Seleccionar —</option>
                    {RUBROS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Total</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editing.total}
                    onChange={(e) => updateField("total", parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-right"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 uppercase">Insumo / Detalle</label>
                <textarea
                  value={editing.insumo}
                  onChange={(e) => updateField("insumo", e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Datos de pago */}
              <div className="border-t border-gray-100 pt-3 mt-3">
                <div className="text-xs text-gray-500 uppercase mb-2">Datos de pago</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-xs text-gray-500">Vencimiento</label>
                    <input
                      type="date"
                      value={fechaVto}
                      onChange={(e) => setFechaVto(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Fecha pago</label>
                    <input
                      type="date"
                      value={fechaPago}
                      onChange={(e) => setFechaPago(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="Sin pagar"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Método de pago</label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* Items extraídos (solo lectura) */}
              {editing.detalleItems && editing.detalleItems.length > 0 && (
                <details className="border border-gray-100 rounded-lg p-2">
                  <summary className="text-xs text-gray-500 uppercase cursor-pointer">Items detectados ({editing.detalleItems.length})</summary>
                  <div className="mt-2 space-y-1">
                    {editing.detalleItems.map((item, i) => (
                      <div key={i} className="text-xs flex justify-between text-gray-600">
                        <span>{item.cantidad}× {item.descripcion}</span>
                        <span className="font-mono">{fmt(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Errores y éxitos */}
              {error && (
                <div className="bg-red-50 text-red-700 rounded-lg p-3 text-xs">⚠️ {error}</div>
              )}
              {success && (
                <div className="bg-emerald-50 text-emerald-700 rounded-lg p-3 text-xs flex items-center gap-2">
                  <span className="text-lg">✓</span>
                  <span>{success}</span>
                </div>
              )}

              {/* Save button */}
              <button
                onClick={save}
                disabled={saving || !editing.proveedor || !editing.total}
                className="w-full bg-navy text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-blue-accent disabled:opacity-50 transition-all"
                style={{ backgroundColor: SUC_COLORS[sucursal] }}
              >
                {saving ? "Guardando..." : `Cargar en EGRESOS · ${SUC_NAMES[sucursal]} ${year}`}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && !editing && (
        <div className="bg-red-50 text-red-700 rounded-lg p-4 mt-4">⚠️ {error}</div>
      )}
    </div>
  );
}
