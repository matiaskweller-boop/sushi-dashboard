"use client";

import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import Link from "next/link";

interface OCRItem {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number;
  subtotal: number;
  alicuotaIva?: number;
  montoIva?: number;
}

interface ImpuestoLine {
  tipo: string;
  monto: number;
  alicuota?: number;
}

interface OCRResult {
  proveedor: string;
  razonSocial: string;
  cuit: string;
  fechaFC: string;
  fechaVto: string;
  nroComprobante: string;
  tipoComprobante: string;
  subtotal: number;
  iva: number;
  otrosImpuestos: number;
  total: number;
  moneda: string;
  tipoCambio: number;
  rubro: string;
  insumo: string;
  detalleItems: OCRItem[];
  impuestos: ImpuestoLine[];
  confianza: number;
  notas: string;
}

interface Factura {
  id: string;
  submittedAt: string;
  submittedBy: string;
  sucursal: string;
  year: string;
  tipoComprobante: string;
  nroComprobante: string;
  proveedor: string;
  razonSocial: string;
  cuit: string;
  fechaIngreso: string;
  fechaFC: string;
  fechaVto: string;
  fechaPago: string;
  rubro: string;
  insumo: string;
  subtotal: number;
  iva: number;
  otrosImpuestos: number;
  total: number;
  metodoPago: string;
  fotoUrl: string;
  confianza: number;
  notasOCR: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  reviewedBy: string;
  reviewedAt: string;
  notasReview: string;
  items: OCRItem[];
  impuestos: ImpuestoLine[];
  moneda: "ARS" | "USD";
  tipoCambio: number;
}

interface ListResponse {
  facturas: Factura[];
  currentUser: { email: string; perms: string[]; isOwner: boolean };
  isApprover: boolean;
  stats: { pendiente: number; aprobada: number; rechazada: number; misPendientes: number };
}

interface ProveedorMaster {
  id: string;
  rowIdx: number;
  nombreSociedad: string;     // razón social
  nombreFantasia: string;     // como lo conocemos
  contacto: string;
  cuit: string;
  formaPago: string;
  aliasCbu: string;
  titularCuenta: string;
  banco: string;
  nroCuenta: string;
  rubro: string;              // producto
  plazoPago: string;
  mail: string;
  corroborado: boolean;
  notas: string;
}

/**
 * Parsea string de plazo de pago a número de días.
 * Acepta: "15 dias", "30 días", "7", "1 dia", "contado" (=0), "anticipado" (=0)
 * Devuelve null si no se puede parsear.
 */
function parsePlazoToDays(plazo: string): number | null {
  if (!plazo) return null;
  const s = plazo.trim().toLowerCase();
  if (!s) return null;
  if (s === "contado" || s === "anticipado" || s === "0") return 0;
  // Look for first number in the string
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1]);
  if (isNaN(n) || n < 0 || n > 365) return null;
  return n;
}

/**
 * Suma días a una fecha ISO (YYYY-MM-DD) y devuelve fecha resultante en ISO.
 */
function addDaysISO(iso: string, days: number): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const SUC_NAMES: Record<string, string> = { palermo: "Palermo", belgrano: "Belgrano", madero: "Madero" };
const SUC_COLORS: Record<string, string> = { palermo: "#2E6DA4", belgrano: "#10B981", madero: "#8B5CF6" };

const RUBROS = [
  "Almacen", "Bebidas c/Alcohol", "Bebidas s/Alcohol", "Postres y Café",
  "Carniceria", "Descartables", "Productos Orientales", "Pescaderia", "Polleria",
  "Verduleria", "Envios", "Alquiler", "Bazar", "Equipamiento", "Farmacia",
  "Honorarios Y Abonos", "Limpieza", "Mantenimiento", "Servicios", "Sueldos",
  "Varios", "Acuerdos", "IIBB", "IMP. INTERNOS", "Otros",
];
const TIPOS = ["FAC A", "FAC B", "FAC C", "RECIBO", "NOTA DE CREDITO", "REMITO", "TICKET", "OTRO"];
const METODOS_PAGO = [
  "Sin pagar", "Efectivo Local", "Tarjeta", "Mercado Pago",
  "Bco ST PALERMO", "Bco ST BELGRANO", "Bco ST MADERO", "BBVA",
  "E-CHEQ", "Efectivo Retiro", "Otro",
];

function fmt(n: number): string { return "$" + Math.round(n).toLocaleString("es-AR"); }

/**
 * Combobox para elegir proveedor de la lista existente o crear uno nuevo.
 */
function ProveedorPicker({
  value,
  onChange,
  proveedores,
  ocrSuggestion,
  onCreated,
}: {
  value: string;
  onChange: (proveedor: string, match?: ProveedorMaster) => void;
  proveedores: ProveedorMaster[];
  ocrSuggestion?: { razonSocial: string; cuit: string; proveedorRaw: string };
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(value); }, [value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return proveedores.slice(0, 30);
    return proveedores.filter((p) => {
      return p.nombreFantasia.toLowerCase().includes(q) ||
             p.nombreSociedad.toLowerCase().includes(q) ||
             p.cuit.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
             p.mail.toLowerCase().includes(q);
    }).slice(0, 30);
  }, [proveedores, search]);

  const exactMatch = filtered.find((p) => p.nombreFantasia.toLowerCase() === search.trim().toLowerCase());
  const showCreateOption = search.trim().length > 0 && !exactMatch;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar proveedor existente o tipear uno nuevo..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium"
      />
      {ocrSuggestion && (ocrSuggestion.razonSocial || ocrSuggestion.proveedorRaw) && (
        <div className="text-[10px] text-gray-400 mt-1 px-1">
          OCR detectó: <b className="text-gray-500">{ocrSuggestion.proveedorRaw}</b>
          {ocrSuggestion.razonSocial && ocrSuggestion.razonSocial !== ocrSuggestion.proveedorRaw && (
            <> · razón social <b className="text-gray-500">{ocrSuggestion.razonSocial}</b></>
          )}
          {ocrSuggestion.cuit && <> · CUIT {ocrSuggestion.cuit}</>}
        </div>
      )}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {filtered.length === 0 && !showCreateOption && (
            <div className="px-3 py-2 text-xs text-gray-400">No hay proveedores en el master</div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id || p.nombreFantasia}
              type="button"
              onClick={() => { onChange(p.nombreFantasia, p); setSearch(p.nombreFantasia); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50"
            >
              <div className="flex items-center gap-1.5 font-medium text-navy">
                {p.nombreFantasia}
                {p.corroborado && <span title="datos corroborados" className="text-[9px] bg-emerald-100 text-emerald-700 px-1 rounded">✓</span>}
              </div>
              <div className="text-[11px] text-gray-500 truncate">
                {p.nombreSociedad && <span>{p.nombreSociedad}</span>}
                {p.cuit && <span> · CUIT {p.cuit}</span>}
                {p.rubro && <span> · {p.rubro}</span>}
                {p.plazoPago && <span> · ⏱ {p.plazoPago}</span>}
              </div>
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              disabled={creating}
              onClick={async () => {
                const name = search.trim();
                if (!name) return;
                setCreating(true);
                try {
                  const res = await fetch("/api/erp/proveedores/master", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      nombreFantasia: name,
                      nombreSociedad: ocrSuggestion?.razonSocial || "",
                      cuit: ocrSuggestion?.cuit || "",
                    }),
                  });
                  const j = await res.json();
                  if (j.error) throw new Error(j.error);
                  // j.proveedor tiene el master completo
                  const master = j.proveedor as ProveedorMaster;
                  onChange(master.nombreFantasia, master);
                  setSearch(master.nombreFantasia);
                  setOpen(false);
                  onCreated?.();
                } catch (e) {
                  alert("Error creando proveedor: " + (e instanceof Error ? e.message : "Error"));
                } finally {
                  setCreating(false);
                }
              }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 bg-emerald-50/30 border-t border-emerald-200 disabled:opacity-50"
            >
              <span className="text-emerald-700 font-medium">
                {creating ? "Creando..." : "+ Crear proveedor nuevo: "}
              </span>
              <span className="text-emerald-700 font-mono">{search.trim()}</span>
              <div className="text-[10px] text-emerald-600 mt-0.5">se guarda en MASTER PROVEEDORES (después completá los datos desde Proveedores)</div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Combobox de rubro: busca en el MASTER RUBROS, permite crear uno nuevo
 * (se persiste al master via API). El callback onChange recibe el nombre.
 */
function RubroPicker({
  value,
  onChange,
  rubros,
  onCreated,
}: {
  value: string;
  onChange: (rubro: string) => void;
  rubros: string[];
  onCreated?: (newRubro: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSearch(value); }, [value]);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rubros.slice(0, 60);
    return rubros.filter((r) => r.toLowerCase().includes(q)).slice(0, 60);
  }, [rubros, search]);
  const exact = filtered.find((r) => r.toLowerCase() === search.trim().toLowerCase());
  const showCreate = search.trim().length >= 2 && !exact;

  const createRubro = async () => {
    const name = search.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/erp/rubros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubro: name }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      onChange(j.rubro.rubro);
      setSearch(j.rubro.rubro);
      setOpen(false);
      onCreated?.(j.rubro.rubro);
    } catch (e) {
      alert("Error creando rubro: " + (e instanceof Error ? e.message : "Error"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar rubro existente o crear uno nuevo..."
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {filtered.length === 0 && !showCreate && (
            <div className="px-3 py-2 text-xs text-gray-400">No hay rubros en el master</div>
          )}
          {filtered.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { onChange(r); setSearch(r); setOpen(false); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50"
            >
              {r}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onClick={createRubro}
              disabled={creating}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 bg-emerald-50/30 border-t border-emerald-200 disabled:opacity-50"
            >
              <span className="text-emerald-700 font-medium">
                {creating ? "Creando..." : "+ Crear rubro nuevo: "}
              </span>
              <span className="text-emerald-700 font-mono">{search.trim()}</span>
              <div className="text-[10px] text-emerald-600 mt-0.5">se guarda en MASTER RUBROS</div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function FacturasPage() {
  const [tab, setTab] = useState<"upload" | "queue" | "history">("upload");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [editing, setEditing] = useState<OCRResult | null>(null);
  const [loadingOcr, setLoadingOcr] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sucursal, setSucursal] = useState<string>("palermo");
  const [year, setYear] = useState<"2025" | "2026">("2026");
  const [metodoPago, setMetodoPago] = useState<string>("Sin pagar");
  const [fechaPago, setFechaPago] = useState<string>("");
  const [esUSD, setEsUSD] = useState(false);
  const [tipoCambio, setTipoCambio] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Proveedores master (cargados de DEUDA AL DIA, cache 10 min server-side)
  const [proveedoresMaster, setProveedoresMaster] = useState<ProveedorMaster[]>([]);

  // Rubros master (cargados al montar)
  const [rubrosMaster, setRubrosMaster] = useState<string[]>([]);
  const fetchRubros = () => {
    fetch("/api/erp/rubros")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.rubros)) {
          const activos = d.rubros.filter((r: { activo: boolean }) => r.activo).map((r: { rubro: string }) => r.rubro);
          // Merge con hardcoded fallback (para que no falte ninguno)
          const merged = Array.from(new Set([...activos, ...RUBROS]));
          merged.sort((a, b) => a.localeCompare(b));
          setRubrosMaster(merged);
        }
      })
      .catch((e) => {
        console.warn("rubros master:", e);
        setRubrosMaster([...RUBROS].sort());
      });
  };
  const fetchProveedores = () => {
    fetch("/api/erp/proveedores/master")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.proveedores)) setProveedoresMaster(d.proveedores);
      })
      .catch((e) => console.warn("master proveedores:", e));
  };

  // List/queue state
  const [listData, setListData] = useState<ListResponse | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [scope, setScope] = useState<"todas" | "mias">("todas");
  const [estadoFilter, setEstadoFilter] = useState<"pendiente" | "aprobada" | "rechazada" | "">("pendiente");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingFactura, setEditingFactura] = useState<Factura | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchList = async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (estadoFilter) params.set("estado", estadoFilter);
      params.set("scope", scope);
      const res = await fetch(`/api/erp/facturas?${params}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error");
      setListData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  };

  // Cargar lista la primera vez
  useEffect(() => {
    fetchList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [scope, estadoFilter]);

  // Cargar masters (proveedores + rubros) al montar
  useEffect(() => {
    fetchProveedores();
    fetchRubros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-default scope basado en si es approver
  useEffect(() => {
    if (listData && !listData.isApprover && scope === "todas") setScope("mias");
  }, [listData, scope]);

  const handleFile = (selectedFile: File) => {
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(jpe?g|png|webp|heic|heif|pdf)$/i)) {
      setError(`Tipo no soportado: ${selectedFile.type || "desconocido"}. Usá JPG, PNG, WebP, HEIC o PDF.`);
      return;
    }
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
    setLoadingOcr(true);
    setError(null);
    setOcrResult(null);
    setEditing(null);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
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
      // Prefill USD si OCR detectó moneda USD
      if (data.data.moneda === "USD") {
        setEsUSD(true);
        if (data.data.tipoCambio && data.data.tipoCambio > 0) {
          setTipoCambio(data.data.tipoCambio);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando imagen");
    } finally {
      setLoadingOcr(false);
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
    setEsUSD(false);
    setTipoCambio(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /**
   * Inicia entrada manual de un movimiento SIN factura (cash, sin comprobante, etc).
   * Crea un editing en blanco para que el usuario complete todo a mano.
   */
  const startManualEntry = () => {
    setFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setError(null);
    setSuccess(null);
    const today = new Date().toISOString().substring(0, 10);
    const empty: OCRResult = {
      proveedor: "",
      razonSocial: "",
      cuit: "",
      fechaFC: today,
      fechaVto: today,
      nroComprobante: "",
      tipoComprobante: "SIN FACTURA",
      subtotal: 0,
      iva: 0,
      otrosImpuestos: 0,
      total: 0,
      moneda: "ARS",
      tipoCambio: 1,
      rubro: "",
      insumo: "",
      detalleItems: [],
      impuestos: [],
      confianza: 100,
      notas: "Carga manual sin factura",
    };
    setEditing(empty);
    setMetodoPago("Efectivo Local");
    setFechaPago(today);
  };

  const submitToQueue = async () => {
    if (!editing) return;
    if (!editing.proveedor || !editing.total) {
      setError("Falta proveedor o total");
      return;
    }
    if (esUSD && (!tipoCambio || tipoCambio <= 0)) {
      setError("Factura en USD: ingresá el tipo de cambio");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/erp/facturas/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal,
          year,
          moneda: esUSD ? "USD" : "ARS",
          tipoCambio: esUSD ? tipoCambio : 1,
          tipoComprobante: editing.tipoComprobante,
          nroComprobante: editing.nroComprobante,
          proveedor: editing.proveedor,
          razonSocial: editing.razonSocial,
          cuit: editing.cuit,
          fechaIngreso: new Date().toISOString().substring(0, 10),
          fechaFC: editing.fechaFC,
          fechaVto: editing.fechaVto,
          fechaPago,
          rubro: editing.rubro,
          insumo: editing.insumo,
          subtotal: editing.subtotal,
          iva: editing.iva,
          otrosImpuestos: editing.otrosImpuestos,
          total: editing.total,
          metodoPago,
          confianza: editing.confianza,
          notasOCR: editing.notas,
          items: editing.detalleItems,
          impuestos: editing.impuestos || [],
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error");
      setSuccess(data.message || "Factura enviada a cola pendiente");
      setTimeout(() => { reset(); fetchList(); setTab("queue"); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const updateEditField = <K extends keyof OCRResult>(field: K, value: OCRResult[K]) => {
    if (!editing) return;
    setEditing({ ...editing, [field]: value });
  };

  const updateFacturaEditField = <K extends keyof Factura>(field: K, value: Factura[K]) => {
    if (!editingFactura) return;
    setEditingFactura({ ...editingFactura, [field]: value });
  };

  const approveFactura = async () => {
    if (!editingFactura) return;
    setReviewingId(editingFactura.id);
    setError(null);
    try {
      const res = await fetch("/api/erp/facturas/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingFactura.id, edits: editingFactura, notas: editingFactura.notasReview }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error");
      setSuccess(data.message);
      setEditingFactura(null);
      setExpandedId(null);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setReviewingId(null);
    }
  };

  const rejectFactura = async () => {
    if (!editingFactura) return;
    const motivo = prompt("Motivo del rechazo:");
    if (!motivo) return;
    setReviewingId(editingFactura.id);
    try {
      const res = await fetch("/api/erp/facturas/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingFactura.id, motivo }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error");
      setEditingFactura(null);
      setExpandedId(null);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setReviewingId(null);
    }
  };

  const filteredFacturas = useMemo(() => {
    if (!listData) return [];
    return listData.facturas;
  }, [listData]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">Carga de facturas</h1>
        <p className="text-xs text-gray-400 mt-1">
          Subís → OCR extrae → revisás → enviás a cola pendiente → un aprobador revisa y carga a EGRESOS
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-4 inline-flex">
        <button
          onClick={() => setTab("upload")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === "upload" ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}
        >
          📸 Subir factura
        </button>
        <button
          onClick={() => { setTab("queue"); setEstadoFilter("pendiente"); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === "queue" ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}
        >
          📋 Pendientes
          {listData && listData.stats.pendiente > 0 && (
            <span className="ml-1.5 inline-block bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full">{listData.stats.pendiente}</span>
          )}
        </button>
        <button
          onClick={() => { setTab("history"); setEstadoFilter("aprobada"); }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === "history" ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}
        >
          ✓ Historial
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">⚠️ {error}</div>}
      {success && <div className="bg-emerald-50 text-emerald-700 rounded-lg p-3 mb-4 text-sm">✓ {success}</div>}

      {/* ==================== TAB: UPLOAD ==================== */}
      {tab === "upload" && (
        <>
          <div className="flex flex-wrap gap-2 mb-4 items-center bg-white border border-gray-200 rounded-xl p-3">
            <span className="text-xs text-gray-500 mr-2">Cargar para:</span>
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
              {Object.entries(SUC_NAMES).map(([id, name]) => (
                <button key={id} onClick={() => setSucursal(id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${sucursal === id ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
                  style={sucursal === id ? { backgroundColor: SUC_COLORS[id] } : {}}>
                  {name}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
              {(["2026", "2025"] as const).map((y) => (
                <button key={y} onClick={() => setYear(y)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${year === y ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Imagen / PDF */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-navy uppercase tracking-wide">Imagen / PDF</h2>
                {!editing && (
                  <button
                    onClick={startManualEntry}
                    className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition font-medium"
                    title="Para gastos sin factura: cash, anticipos, ajustes manuales"
                  >
                    ✏️ Cargar sin factura
                  </button>
                )}
              </div>
              {!previewUrl && !editing ? (
                <div onDrop={onDrop} onDragOver={(e) => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-accent hover:bg-blue-50/30">
                  <div className="text-4xl mb-2">📸 📄</div>
                  <div className="text-sm text-gray-600 mb-1">Click o arrastrá foto / PDF</div>
                  <div className="text-xs text-gray-400">JPG, PNG, WEBP, HEIC, PDF · max 20MB</div>
                  <input ref={fileInputRef} type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,image/*"
                    onChange={onFileChange} className="hidden" />
                </div>
              ) : !previewUrl && editing ? (
                <div className="border-2 border-dashed border-amber-300 bg-amber-50/40 rounded-lg p-8 text-center">
                  <div className="text-4xl mb-2">✏️ 🧾</div>
                  <div className="text-sm text-amber-700 font-medium mb-1">Carga manual sin factura</div>
                  <div className="text-xs text-amber-600 mb-3">El movimiento se va a registrar sin foto adjunta</div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-accent hover:underline"
                  >
                    o subí una foto si la conseguís
                  </button>
                  <input ref={fileInputRef} type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,image/*"
                    onChange={onFileChange} className="hidden" />
                  <div className="mt-4">
                    <button onClick={reset} className="text-xs text-gray-500 hover:underline">
                      ✕ cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {file?.type === "application/pdf" ? (
                    <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50" style={{ height: "500px" }}>
                      <embed src={previewUrl || ""} type="application/pdf" className="w-full h-full" />
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={previewUrl || ""} alt="Factura" className="max-h-[500px] w-full object-contain rounded-lg border border-gray-200" />
                  )}
                  <div className="text-xs text-gray-400 mt-1 truncate">{file?.name} · {((file?.size || 0) / 1024 / 1024).toFixed(2)} MB</div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={processOCR} disabled={loadingOcr}
                      className="flex-1 bg-navy text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                      {loadingOcr ? "Procesando con Gemini..." : ocrResult ? "↻ Re-procesar" : "✨ Extraer datos con IA"}
                    </button>
                    <button onClick={reset} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                      Cambiar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Datos extraídos */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-navy uppercase tracking-wide mb-3">Datos extraídos</h2>
              {!editing && !loadingOcr && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  {file ? "Procesá la imagen para extraer datos" : (
                    <>
                      <div>Subí una factura primero</div>
                      <div className="text-[11px] mt-2">— o —</div>
                      <button
                        onClick={startManualEntry}
                        className="text-xs text-amber-600 hover:underline mt-1"
                      >
                        ✏️ cargar movimiento sin factura
                      </button>
                    </>
                  )}
                </div>
              )}
              {loadingOcr && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-2 animate-pulse">🔍</div>
                  <div className="text-sm text-gray-500">Gemini leyendo la factura...</div>
                </div>
              )}
              {editing && !loadingOcr && (
                <div className="space-y-3 text-sm">
                  <div className={`rounded-lg p-2 text-xs flex items-center justify-between ${
                    editing.confianza >= 80 ? "bg-emerald-50 text-emerald-700" :
                    editing.confianza >= 60 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                  }`}>
                    <span>Confianza OCR: <b>{editing.confianza}%</b></span>
                    {editing.notas && <span className="opacity-75 max-w-[60%] truncate">{editing.notas}</span>}
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 uppercase">Proveedor * <span className="text-[10px] text-gray-400 normal-case">— elegí del master o creá uno nuevo</span></label>
                    <ProveedorPicker
                      value={editing.proveedor}
                      onChange={(name, match) => {
                        updateEditField("proveedor", name);
                        if (match) {
                          // Si seleccionó del master, completar todo lo que sabemos
                          if (match.nombreSociedad) updateEditField("razonSocial", match.nombreSociedad);
                          if (match.cuit) updateEditField("cuit", match.cuit);
                          // Auto-calcular fecha de vencimiento: fechaFC + plazoPago
                          const dias = parsePlazoToDays(match.plazoPago);
                          const fechaFC = editing.fechaFC;
                          if (dias !== null && fechaFC) {
                            const newVto = addDaysISO(fechaFC, dias);
                            updateEditField("fechaVto", newVto);
                          }
                        }
                      }}
                      proveedores={proveedoresMaster}
                      ocrSuggestion={ocrResult ? {
                        razonSocial: ocrResult.razonSocial,
                        cuit: ocrResult.cuit,
                        proveedorRaw: ocrResult.proveedor,
                      } : undefined}
                      onCreated={() => fetchProveedores()}
                    />
                    {(() => {
                      const matched = proveedoresMaster.find((p) => p.nombreFantasia.toLowerCase() === editing.proveedor.toLowerCase());
                      if (!matched) return null;
                      return (
                        <div className="mt-1.5 text-[11px] bg-blue-50 border border-blue-100 rounded-md px-2 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-gray-600">
                          {matched.plazoPago && <span>⏱ <b className="text-blue-accent">{matched.plazoPago}</b></span>}
                          {matched.formaPago && <span>💳 {matched.formaPago}</span>}
                          {matched.banco && <span>🏦 {matched.banco}</span>}
                          {matched.aliasCbu && <span>📋 {matched.aliasCbu}</span>}
                          {matched.mail && <a href={`mailto:${matched.mail}`} className="text-blue-accent hover:underline">✉ {matched.mail}</a>}
                          {!matched.corroborado && <span className="text-amber-700">⚠️ sin corroborar</span>}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 uppercase">Tipo *</label>
                      <select value={editing.tipoComprobante} onChange={(e) => updateEditField("tipoComprobante", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                        {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase">Nro</label>
                      <input type="text" value={editing.nroComprobante} onChange={(e) => updateEditField("nroComprobante", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 uppercase">Fecha FC *</label>
                      <input type="date" value={editing.fechaFC} onChange={(e) => {
                        const newFC = e.target.value;
                        updateEditField("fechaFC", newFC);
                        // Recalcular vencimiento si el proveedor matcheado tiene plazo
                        const matched = proveedoresMaster.find((p) => p.nombreFantasia.toLowerCase() === editing.proveedor.toLowerCase());
                        if (matched) {
                          const dias = parsePlazoToDays(matched.plazoPago);
                          if (dias !== null && newFC) updateEditField("fechaVto", addDaysISO(newFC, dias));
                        }
                      }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 uppercase flex items-center justify-between">
                        <span>Vencimiento</span>
                        {(() => {
                          const matched = proveedoresMaster.find((p) => p.nombreFantasia.toLowerCase() === editing.proveedor.toLowerCase());
                          const dias = matched ? parsePlazoToDays(matched.plazoPago) : null;
                          if (dias === null) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (editing.fechaFC) updateEditField("fechaVto", addDaysISO(editing.fechaFC, dias));
                              }}
                              className="text-[9px] text-blue-accent hover:underline normal-case"
                              title={`Plazo del master: ${matched?.plazoPago}`}
                            >
                              auto (+{dias}d)
                            </button>
                          );
                        })()}
                      </label>
                      <input type="date" value={editing.fechaVto} onChange={(e) => updateEditField("fechaVto", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 uppercase">
                      Rubro * <span className="text-[10px] text-gray-400 normal-case">— buscá del master o creá uno nuevo</span>
                    </label>
                    <RubroPicker
                      value={editing.rubro}
                      onChange={(r) => updateEditField("rubro", r)}
                      rubros={rubrosMaster}
                      onCreated={() => fetchRubros()}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 uppercase">Insumo / Detalle</label>
                    <textarea value={editing.insumo} onChange={(e) => updateEditField("insumo", e.target.value)}
                      rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>

                  {/* Toggle USD + tipo de cambio */}
                  <div className={`rounded-lg p-3 border ${esUSD ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={esUSD}
                        onChange={(e) => setEsUSD(e.target.checked)}
                        className="cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-gray-700">💵 Factura en USD</span>
                      {esUSD && <span className="text-[10px] text-emerald-700 ml-1">se convertirá a ARS al aprobar</span>}
                    </label>
                    {esUSD && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase">Tipo de cambio (1 USD = X ARS) *</label>
                          <input
                            type="number"
                            step="0.01"
                            value={tipoCambio || ""}
                            onChange={(e) => setTipoCambio(parseFloat(e.target.value) || 0)}
                            placeholder="ej 1050.50"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono text-right"
                          />
                        </div>
                        <div className="text-xs text-emerald-800">
                          {tipoCambio > 0 && editing.total > 0 ? (
                            <>
                              <div className="text-[10px] text-gray-500 uppercase">Total convertido a ARS</div>
                              <div className="text-base font-bold font-mono">${(editing.total * tipoCambio).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </>
                          ) : (
                            <div className="text-amber-700 text-[11px] mt-1">Ingresá el TC que figura en la factura</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Desglose de impuestos */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs font-semibold text-gray-600 uppercase mb-2">Desglose</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-gray-500">Subtotal sin IVA</label>
                        <input type="number" step="0.01" value={editing.subtotal}
                          onChange={(e) => updateEditField("subtotal", parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 font-mono text-right" />
                      </div>
                      <div>
                        <label className="text-gray-500">IVA</label>
                        <input type="number" step="0.01" value={editing.iva}
                          onChange={(e) => updateEditField("iva", parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 font-mono text-right" />
                      </div>
                      <div>
                        <label className="text-gray-500">Otros impuestos</label>
                        <input type="number" step="0.01" value={editing.otrosImpuestos}
                          onChange={(e) => updateEditField("otrosImpuestos", parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 font-mono text-right" />
                      </div>
                      <div>
                        <label className="text-gray-500 font-semibold">Total * <span className="text-[10px] text-gray-400 normal-case">{esUSD ? "(USD)" : "(ARS)"}</span></label>
                        <input type="number" step="0.01" value={editing.total}
                          onChange={(e) => updateEditField("total", parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 font-mono text-right font-semibold" />
                      </div>
                    </div>
                    {Math.abs((editing.subtotal + editing.iva + editing.otrosImpuestos) - editing.total) > 1 && (
                      <div className="text-[11px] text-amber-600 mt-2">
                        ⚠️ Subtotal + IVA + Otros = {fmt(editing.subtotal + editing.iva + editing.otrosImpuestos)} no coincide con total {fmt(editing.total)}
                      </div>
                    )}
                  </div>

                  {/* Pago */}
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-xs text-gray-500 uppercase mb-2">Pago</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">Fecha pago</label>
                        <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Método</label>
                        <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                          {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Items con edicion de unidad */}
                  {editing.detalleItems && editing.detalleItems.length > 0 && (
                    <details className="border border-gray-100 rounded-lg p-2" open>
                      <summary className="text-xs font-semibold text-gray-700 uppercase cursor-pointer">
                        Items ({editing.detalleItems.length}) — editá unidad/cantidad/precio
                      </summary>
                      <div className="mt-2 space-y-2 text-xs">
                        {editing.detalleItems.map((item, i) => (
                          <div key={i} className="bg-gray-50 rounded p-2 space-y-1.5">
                            <input
                              type="text"
                              value={item.descripcion}
                              onChange={(e) => {
                                const next = [...editing.detalleItems];
                                next[i] = { ...next[i], descripcion: e.target.value };
                                updateEditField("detalleItems", next);
                              }}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                            />
                            <div className="grid grid-cols-4 gap-1.5">
                              <div>
                                <label className="text-[10px] text-gray-500">Cantidad</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.cantidad}
                                  onChange={(e) => {
                                    const next = [...editing.detalleItems];
                                    next[i] = { ...next[i], cantidad: parseFloat(e.target.value) || 0 };
                                    updateEditField("detalleItems", next);
                                  }}
                                  className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono text-right"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500">Unidad</label>
                                <input
                                  type="text"
                                  value={item.unidad}
                                  onChange={(e) => {
                                    const next = [...editing.detalleItems];
                                    next[i] = { ...next[i], unidad: e.target.value };
                                    updateEditField("detalleItems", next);
                                  }}
                                  placeholder="kg, lt, ud"
                                  className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500">Precio Un.</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.precioUnitario}
                                  onChange={(e) => {
                                    const next = [...editing.detalleItems];
                                    const pu = parseFloat(e.target.value) || 0;
                                    next[i] = { ...next[i], precioUnitario: pu, subtotal: pu * (next[i].cantidad || 0) };
                                    updateEditField("detalleItems", next);
                                  }}
                                  className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono text-right"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-500">Subtotal</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.subtotal}
                                  onChange={(e) => {
                                    const next = [...editing.detalleItems];
                                    next[i] = { ...next[i], subtotal: parseFloat(e.target.value) || 0 };
                                    updateEditField("detalleItems", next);
                                  }}
                                  className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono text-right"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...editing.detalleItems, { descripcion: "", cantidad: 1, unidad: "unidad", precioUnitario: 0, subtotal: 0 }];
                            updateEditField("detalleItems", next);
                          }}
                          className="text-xs text-blue-accent hover:underline"
                        >
                          + Agregar item
                        </button>
                      </div>
                    </details>
                  )}

                  {/* Impuestos editables */}
                  <details className="border border-gray-100 rounded-lg p-2" open>
                    <summary className="text-xs font-semibold text-gray-700 uppercase cursor-pointer">
                      Impuestos ({editing.impuestos?.length || 0}) — IVA, IIBB, percepciones
                    </summary>
                    <div className="mt-2 space-y-1.5 text-xs">
                      {(editing.impuestos || []).map((imp, i) => (
                        <div key={i} className="grid grid-cols-12 gap-1.5 items-end">
                          <input
                            type="text"
                            value={imp.tipo}
                            onChange={(e) => {
                              const next = [...(editing.impuestos || [])];
                              next[i] = { ...next[i], tipo: e.target.value };
                              updateEditField("impuestos", next);
                            }}
                            placeholder="IVA 21%"
                            className="col-span-6 border border-gray-200 rounded px-2 py-1 text-xs"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={imp.alicuota || 0}
                            onChange={(e) => {
                              const next = [...(editing.impuestos || [])];
                              next[i] = { ...next[i], alicuota: parseFloat(e.target.value) || 0 };
                              updateEditField("impuestos", next);
                            }}
                            placeholder="%"
                            className="col-span-2 border border-gray-200 rounded px-1.5 py-1 text-xs font-mono text-right"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={imp.monto}
                            onChange={(e) => {
                              const next = [...(editing.impuestos || [])];
                              next[i] = { ...next[i], monto: parseFloat(e.target.value) || 0 };
                              updateEditField("impuestos", next);
                            }}
                            className="col-span-3 border border-gray-200 rounded px-1.5 py-1 text-xs font-mono text-right font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = (editing.impuestos || []).filter((_, idx) => idx !== i);
                              updateEditField("impuestos", next);
                            }}
                            className="col-span-1 text-red-500 hover:text-red-700"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(editing.impuestos || []), { tipo: "", monto: 0, alicuota: 0 }];
                          updateEditField("impuestos", next);
                        }}
                        className="text-xs text-blue-accent hover:underline"
                      >
                        + Agregar impuesto (IVA / IIBB / Percep / etc.)
                      </button>
                    </div>
                  </details>

                  <button onClick={submitToQueue} disabled={submitting || !editing.proveedor || !editing.total}
                    className="w-full bg-navy text-white px-4 py-3 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: SUC_COLORS[sucursal] }}>
                    {submitting ? "Enviando..." : `Enviar a cola pendiente · ${SUC_NAMES[sucursal]} ${year}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ==================== TAB: QUEUE / HISTORY ==================== */}
      {(tab === "queue" || tab === "history") && (
        <>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            {listData?.isApprover && (
              <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
                <button onClick={() => setScope("todas")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${scope === "todas" ? "bg-blue-50 text-blue-accent" : "text-gray-600 hover:bg-gray-50"}`}>
                  Todas
                </button>
                <button onClick={() => setScope("mias")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${scope === "mias" ? "bg-blue-50 text-blue-accent" : "text-gray-600 hover:bg-gray-50"}`}>
                  Mías
                </button>
              </div>
            )}
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
              {[
                { id: "pendiente" as const, label: "⏳ Pendientes", color: "bg-amber-50 text-amber-700" },
                { id: "aprobada" as const, label: "✓ Aprobadas", color: "bg-emerald-50 text-emerald-700" },
                { id: "rechazada" as const, label: "✕ Rechazadas", color: "bg-red-50 text-red-700" },
                { id: "" as const, label: "Todas", color: "bg-gray-100 text-gray-700" },
              ].map((opt) => (
                <button key={opt.id} onClick={() => setEstadoFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium ${estadoFilter === opt.id ? opt.color : "text-gray-600 hover:bg-gray-50"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={fetchList} className="text-xs text-blue-accent hover:underline ml-auto">↻ refrescar</button>
          </div>

          {loadingList && <div className="text-center py-12 text-gray-400">Cargando facturas...</div>}

          {!loadingList && filteredFacturas.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-sm text-gray-400">
              No hay facturas {estadoFilter || ""}
            </div>
          )}

          {!loadingList && filteredFacturas.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Estado</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Sucursal</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Subido por</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-600 uppercase">Total</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFacturas.map((f) => {
                    const isExp = expandedId === f.id;
                    const isApprover = listData?.isApprover;
                    const isMine = listData?.currentUser.email.toLowerCase() === f.submittedBy.toLowerCase();
                    return (
                      <Fragment key={f.id}>
                        <tr onClick={() => {
                          if (isExp) {
                            setExpandedId(null);
                            setEditingFactura(null);
                          } else {
                            setExpandedId(f.id);
                            setEditingFactura({ ...f });
                          }
                        }} className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${
                          f.estado === "pendiente" ? "bg-amber-50/20" :
                          f.estado === "rechazada" ? "bg-red-50/20" : ""
                        }`}>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 text-xs rounded-md font-medium ${
                              f.estado === "pendiente" ? "bg-amber-100 text-amber-700" :
                              f.estado === "aprobada" ? "bg-emerald-100 text-emerald-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {f.estado === "pendiente" ? "⏳" : f.estado === "aprobada" ? "✓" : "✕"} {f.estado}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{f.fechaFC || f.submittedAt.substring(0, 10)}</td>
                          <td className="px-3 py-2 text-xs font-medium" style={{ color: SUC_COLORS[f.sucursal] }}>{SUC_NAMES[f.sucursal] || f.sucursal}</td>
                          <td className="px-3 py-2 font-medium text-navy">{f.proveedor}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{f.tipoComprobante} {f.nroComprobante}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[140px]">{isMine ? "Yo" : f.submittedBy}</td>
                          <td className="px-3 py-2 text-right font-mono text-navy font-semibold">
                            {fmt(f.total)}
                            {f.moneda === "USD" && (
                              <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-normal">
                                💵 USD {f.tipoCambio > 0 ? `× ${f.tipoCambio}` : "sin TC"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400">{isExp ? "▼" : "▶"}</td>
                        </tr>
                        {isExp && editingFactura && editingFactura.id === f.id && (
                          <tr className="bg-blue-50/30 border-b border-blue-100">
                            <td colSpan={8} className="px-6 py-4">
                              {/* SUCURSAL DESTACADA - el approver verifica antes de aprobar */}
                              {f.estado === "pendiente" && listData?.isApprover && (
                                <div className="mb-4 bg-white border-2 rounded-xl p-3" style={{ borderColor: SUC_COLORS[editingFactura.sucursal] }}>
                                  <div className="text-xs font-semibold text-gray-700 uppercase mb-2">⚠️ Verificar sucursal antes de aprobar</div>
                                  <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1 mb-2">
                                    {Object.entries(SUC_NAMES).map(([id, name]) => (
                                      <button key={id} onClick={() => updateFacturaEditField("sucursal", id)}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${editingFactura.sucursal === id ? "text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
                                        style={editingFactura.sucursal === id ? { backgroundColor: SUC_COLORS[id] } : {}}>
                                        {name}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1 inline-flex">
                                    {(["2026", "2025"] as const).map((y) => (
                                      <button key={y} onClick={() => updateFacturaEditField("year", y)}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${editingFactura.year === y ? "bg-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                                        Año {y}
                                      </button>
                                    ))}
                                  </div>
                                  {editingFactura.sucursal !== f.sucursal && (
                                    <div className="text-[11px] text-amber-700 mt-2 bg-amber-50 px-2 py-1 rounded">
                                      ⚠️ Sucursal cambiada de <b>{SUC_NAMES[f.sucursal]}</b> a <b>{SUC_NAMES[editingFactura.sucursal]}</b>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Detalle expandido — editable solo si pendiente */}
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold text-gray-600 uppercase">Datos comerciales</div>
                                  <div>
                                    <label className="text-gray-500 block">Proveedor</label>
                                    {f.estado === "pendiente" ? (
                                      <ProveedorPicker
                                        value={editingFactura.proveedor}
                                        onChange={(name, match) => {
                                          updateFacturaEditField("proveedor", name);
                                          if (match) {
                                            if (match.nombreSociedad) updateFacturaEditField("razonSocial", match.nombreSociedad);
                                            if (match.cuit) updateFacturaEditField("cuit", match.cuit);
                                            // Auto-recompute vencimiento
                                            const dias = parsePlazoToDays(match.plazoPago);
                                            if (dias !== null && editingFactura.fechaFC) {
                                              updateFacturaEditField("fechaVto", addDaysISO(editingFactura.fechaFC, dias));
                                            }
                                          }
                                        }}
                                        proveedores={proveedoresMaster}
                                        onCreated={() => fetchProveedores()}
                                      />
                                    ) : (
                                      <div className="border border-gray-200 rounded-md px-2 py-1 text-xs font-medium bg-gray-50">{editingFactura.proveedor}</div>
                                    )}
                                    {(() => {
                                      const matched = proveedoresMaster.find((p) => p.nombreFantasia.toLowerCase() === editingFactura.proveedor.toLowerCase());
                                      if (!matched) return null;
                                      return (
                                        <div className="mt-1 text-[10px] bg-blue-50 border border-blue-100 rounded-md px-2 py-1 flex flex-wrap gap-x-2 gap-y-0.5 text-gray-600">
                                          {matched.plazoPago && <span>⏱ <b className="text-blue-accent">{matched.plazoPago}</b></span>}
                                          {matched.formaPago && <span>💳 {matched.formaPago}</span>}
                                          {matched.aliasCbu && <span>📋 {matched.aliasCbu}</span>}
                                          {matched.mail && <span>✉ {matched.mail}</span>}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <div>
                                    <label className="text-gray-500 block">Razón social</label>
                                    <input value={editingFactura.razonSocial} disabled={f.estado !== "pendiente"}
                                      onChange={(e) => updateFacturaEditField("razonSocial", e.target.value)}
                                      className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50" />
                                  </div>
                                  <div>
                                    <label className="text-gray-500 block">CUIT</label>
                                    <input value={editingFactura.cuit} disabled={f.estado !== "pendiente"}
                                      onChange={(e) => updateFacturaEditField("cuit", e.target.value)}
                                      className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs font-mono disabled:bg-gray-50" />
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div>
                                      <label className="text-gray-500 block">Tipo</label>
                                      <select value={editingFactura.tipoComprobante} disabled={f.estado !== "pendiente"}
                                        onChange={(e) => updateFacturaEditField("tipoComprobante", e.target.value)}
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50">
                                        {TIPOS.map((t) => <option key={t}>{t}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-gray-500 block">Nro</label>
                                      <input value={editingFactura.nroComprobante} disabled={f.estado !== "pendiente"}
                                        onChange={(e) => updateFacturaEditField("nroComprobante", e.target.value)}
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs font-mono disabled:bg-gray-50" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-gray-500 block">Rubro</label>
                                    {f.estado === "pendiente" ? (
                                      <RubroPicker
                                        value={editingFactura.rubro}
                                        onChange={(r) => updateFacturaEditField("rubro", r)}
                                        rubros={rubrosMaster}
                                        onCreated={() => fetchRubros()}
                                      />
                                    ) : (
                                      <div className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-gray-50 text-gray-600">{editingFactura.rubro}</div>
                                    )}
                                  </div>
                                  <div>
                                    <label className="text-gray-500 block">Insumo</label>
                                    <textarea value={editingFactura.insumo} disabled={f.estado !== "pendiente"}
                                      onChange={(e) => updateFacturaEditField("insumo", e.target.value)} rows={2}
                                      className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50" />
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="text-xs font-semibold text-gray-600 uppercase">Fechas y pago</div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div>
                                      <label className="text-gray-500 block">Fecha FC</label>
                                      <input type="date" value={editingFactura.fechaFC} disabled={f.estado !== "pendiente"}
                                        onChange={(e) => {
                                          const newFC = e.target.value;
                                          updateFacturaEditField("fechaFC", newFC);
                                          const matched = proveedoresMaster.find((p) => p.nombreFantasia.toLowerCase() === editingFactura.proveedor.toLowerCase());
                                          if (matched) {
                                            const dias = parsePlazoToDays(matched.plazoPago);
                                            if (dias !== null && newFC) updateFacturaEditField("fechaVto", addDaysISO(newFC, dias));
                                          }
                                        }}
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50" />
                                    </div>
                                    <div>
                                      <label className="text-gray-500 flex items-center justify-between">
                                        <span>Vencimiento</span>
                                        {(() => {
                                          const matched = proveedoresMaster.find((p) => p.nombreFantasia.toLowerCase() === editingFactura.proveedor.toLowerCase());
                                          const dias = matched ? parsePlazoToDays(matched.plazoPago) : null;
                                          if (dias === null || f.estado !== "pendiente") return null;
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => editingFactura.fechaFC && updateFacturaEditField("fechaVto", addDaysISO(editingFactura.fechaFC, dias))}
                                              className="text-[9px] text-blue-accent hover:underline"
                                            >
                                              auto +{dias}d
                                            </button>
                                          );
                                        })()}
                                      </label>
                                      <input type="date" value={editingFactura.fechaVto} disabled={f.estado !== "pendiente"}
                                        onChange={(e) => updateFacturaEditField("fechaVto", e.target.value)}
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50" />
                                    </div>
                                    <div>
                                      <label className="text-gray-500 block">Fecha pago</label>
                                      <input type="date" value={editingFactura.fechaPago} disabled={f.estado !== "pendiente"}
                                        onChange={(e) => updateFacturaEditField("fechaPago", e.target.value)}
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50" />
                                    </div>
                                    <div>
                                      <label className="text-gray-500 block">F. ingreso</label>
                                      <input type="date" value={editingFactura.fechaIngreso} disabled={f.estado !== "pendiente"}
                                        onChange={(e) => updateFacturaEditField("fechaIngreso", e.target.value)}
                                        className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-gray-500 block">Método de pago</label>
                                    <select value={editingFactura.metodoPago} disabled={f.estado !== "pendiente"}
                                      onChange={(e) => updateFacturaEditField("metodoPago", e.target.value)}
                                      className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs disabled:bg-gray-50">
                                      {METODOS_PAGO.map((m) => <option key={m}>{m}</option>)}
                                    </select>
                                  </div>

                                  {/* USD toggle en aprobacion */}
                                  <div className={`rounded-lg p-2 mt-2 border ${editingFactura.moneda === "USD" ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
                                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px]">
                                      <input
                                        type="checkbox"
                                        checked={editingFactura.moneda === "USD"}
                                        disabled={f.estado !== "pendiente"}
                                        onChange={(e) => updateFacturaEditField("moneda", e.target.checked ? "USD" : "ARS")}
                                      />
                                      <span className="font-semibold text-gray-700">💵 Factura en USD</span>
                                    </label>
                                    {editingFactura.moneda === "USD" && (
                                      <div className="mt-1.5">
                                        <label className="text-[9px] text-gray-500 uppercase">TC (1 USD = X ARS) *</label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={editingFactura.tipoCambio || 0}
                                          disabled={f.estado !== "pendiente"}
                                          onChange={(e) => updateFacturaEditField("tipoCambio", parseFloat(e.target.value) || 0)}
                                          placeholder="ej 1050.50"
                                          className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-[11px] font-mono text-right"
                                        />
                                        {editingFactura.tipoCambio > 0 && editingFactura.total > 0 && (
                                          <div className="text-[10px] text-emerald-700 mt-1 font-mono">
                                            Total ARS: ${(editingFactura.total * editingFactura.tipoCambio).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="bg-white rounded-lg p-2 mt-2">
                                    <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
                                      Desglose {editingFactura.moneda === "USD" ? "(USD)" : "(ARS)"}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <div>
                                        <label className="text-[10px] text-gray-500">Subtotal</label>
                                        <input type="number" step="0.01" value={editingFactura.subtotal} disabled={f.estado !== "pendiente"}
                                          onChange={(e) => updateFacturaEditField("subtotal", parseFloat(e.target.value) || 0)}
                                          className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs font-mono text-right disabled:bg-gray-50" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-gray-500">IVA</label>
                                        <input type="number" step="0.01" value={editingFactura.iva} disabled={f.estado !== "pendiente"}
                                          onChange={(e) => updateFacturaEditField("iva", parseFloat(e.target.value) || 0)}
                                          className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs font-mono text-right disabled:bg-gray-50" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-gray-500">Otros imp.</label>
                                        <input type="number" step="0.01" value={editingFactura.otrosImpuestos} disabled={f.estado !== "pendiente"}
                                          onChange={(e) => updateFacturaEditField("otrosImpuestos", parseFloat(e.target.value) || 0)}
                                          className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs font-mono text-right disabled:bg-gray-50" />
                                      </div>
                                      <div>
                                        <label className="text-[10px] text-gray-500 font-bold">TOTAL</label>
                                        <input type="number" step="0.01" value={editingFactura.total} disabled={f.estado !== "pendiente"}
                                          onChange={(e) => updateFacturaEditField("total", parseFloat(e.target.value) || 0)}
                                          className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs font-mono text-right font-bold disabled:bg-gray-50" />
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="text-xs font-semibold text-gray-600 uppercase">Items y meta</div>
                                  <div className="bg-white rounded-lg p-2 max-h-[120px] overflow-y-auto">
                                    {editingFactura.items && editingFactura.items.length > 0 ? (
                                      editingFactura.items.map((it, i) => (
                                        <div key={i} className="text-[11px] flex justify-between border-b border-gray-50 py-0.5">
                                          <span className="truncate flex-1 mr-2">{it.cantidad}× {it.descripcion}</span>
                                          <span className="font-mono">{fmt(it.subtotal)}</span>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="text-[11px] text-gray-400 italic">Sin items</div>
                                    )}
                                  </div>

                                  {/* Impuestos editables (si pendiente y aprobador) */}
                                  {f.estado === "pendiente" && (
                                    <div className="bg-white rounded-lg p-2 mt-2">
                                      <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
                                        Impuestos ({editingFactura.impuestos?.length || 0}) — IVA, IIBB, percep
                                      </div>
                                      <div className="space-y-1">
                                        {(editingFactura.impuestos || []).map((imp, i) => (
                                          <div key={i} className="grid grid-cols-12 gap-1 items-center">
                                            <input
                                              type="text"
                                              value={imp.tipo}
                                              onChange={(e) => {
                                                const next = [...(editingFactura.impuestos || [])];
                                                next[i] = { ...next[i], tipo: e.target.value };
                                                updateFacturaEditField("impuestos", next);
                                              }}
                                              placeholder="IVA 21%"
                                              className="col-span-7 border border-gray-200 rounded px-1.5 py-0.5 text-[11px]"
                                            />
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={imp.monto}
                                              onChange={(e) => {
                                                const next = [...(editingFactura.impuestos || [])];
                                                next[i] = { ...next[i], monto: parseFloat(e.target.value) || 0 };
                                                updateFacturaEditField("impuestos", next);
                                              }}
                                              className="col-span-4 border border-gray-200 rounded px-1.5 py-0.5 text-[11px] font-mono text-right"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const next = (editingFactura.impuestos || []).filter((_, idx) => idx !== i);
                                                updateFacturaEditField("impuestos", next);
                                              }}
                                              className="col-span-1 text-red-500 hover:text-red-700 text-xs"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="flex gap-1 mt-1.5 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const subtotal = editingFactura.subtotal || 0;
                                            const ivaCalc = subtotal * 0.21;
                                            const next = [...(editingFactura.impuestos || []), { tipo: "IVA 21%", monto: Math.round(ivaCalc * 100) / 100, alicuota: 21 }];
                                            updateFacturaEditField("impuestos", next);
                                          }}
                                          className="text-[10px] text-blue-accent hover:underline px-1.5 py-0.5 bg-blue-50 rounded"
                                        >
                                          + IVA 21%
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const subtotal = editingFactura.subtotal || 0;
                                            const ivaCalc = subtotal * 0.105;
                                            const next = [...(editingFactura.impuestos || []), { tipo: "IVA 10,5%", monto: Math.round(ivaCalc * 100) / 100, alicuota: 10.5 }];
                                            updateFacturaEditField("impuestos", next);
                                          }}
                                          className="text-[10px] text-blue-accent hover:underline px-1.5 py-0.5 bg-blue-50 rounded"
                                        >
                                          + IVA 10,5%
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = [...(editingFactura.impuestos || []), { tipo: "PERC. IVA 3%", monto: 0, alicuota: 3 }];
                                            updateFacturaEditField("impuestos", next);
                                          }}
                                          className="text-[10px] text-blue-accent hover:underline px-1.5 py-0.5 bg-blue-50 rounded"
                                        >
                                          + PERC. IVA
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = [...(editingFactura.impuestos || []), { tipo: "IIBB", monto: 0, alicuota: 3 }];
                                            updateFacturaEditField("impuestos", next);
                                          }}
                                          className="text-[10px] text-blue-accent hover:underline px-1.5 py-0.5 bg-blue-50 rounded"
                                        >
                                          + IIBB
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = [...(editingFactura.impuestos || []), { tipo: "", monto: 0 }];
                                            updateFacturaEditField("impuestos", next);
                                          }}
                                          className="text-[10px] text-gray-500 hover:underline px-1.5 py-0.5"
                                        >
                                          + otro
                                        </button>
                                      </div>
                                      {(!editingFactura.impuestos || editingFactura.impuestos.length === 0) && (
                                        <div className="text-[10px] text-amber-600 mt-1 bg-amber-50 px-1.5 py-1 rounded">
                                          ⚠️ No hay impuestos. Si la factura tiene IVA / IIBB, agregalos antes de aprobar.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="text-[10px] text-gray-400">
                                    Subido: {f.submittedAt.substring(0, 16).replace("T", " ")}<br/>
                                    Por: {f.submittedBy}<br/>
                                    Confianza OCR: {f.confianza}%<br/>
                                    {f.notasOCR && <>Notas OCR: {f.notasOCR}<br/></>}
                                    {f.reviewedBy && <>Revisado por: {f.reviewedBy}<br/></>}
                                    {f.reviewedAt && <>Revisado: {f.reviewedAt.substring(0, 16).replace("T", " ")}<br/></>}
                                    {f.notasReview && <>Notas review: {f.notasReview}</>}
                                  </div>

                                  {f.estado === "pendiente" && isApprover && (
                                    <div className="flex gap-2 pt-2 border-t border-blue-200">
                                      <button onClick={approveFactura} disabled={!!reviewingId}
                                        className="flex-1 bg-emerald-600 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                                        ✓ Aprobar y exportar a EGRESOS
                                      </button>
                                      <button onClick={rejectFactura} disabled={!!reviewingId}
                                        className="px-3 py-2 border border-red-300 text-red-700 rounded-md text-xs font-medium hover:bg-red-50 disabled:opacity-50">
                                        ✕ Rechazar
                                      </button>
                                    </div>
                                  )}
                                  {f.estado === "pendiente" && !isApprover && (
                                    <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-md">
                                      Pendiente de aprobación por un admin.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
