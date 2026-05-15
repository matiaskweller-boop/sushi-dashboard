"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  tag?: string;
  sectionTitle?: string;
  pageTitle?: string;
}

interface MenuSection {
  id: string;
  title: string;
  subtitle?: string;
  items: Array<Omit<MenuItem, "sectionTitle" | "pageTitle">>;
}

interface MenuPage {
  id: string;
  title: string;
  sections: MenuSection[];
}

interface MenuData {
  pages: MenuPage[];
}

type TipoPresupuesto = "catering" | "evento_local" | "a_medida";

interface PresupuestoItem {
  id: string;           // unique id for the line
  menuItemId?: string;  // ref to menu item if it's a menu item
  nombre: string;
  cantidad: number;
  unidad?: string;      // "unidad", "personas", etc
  costoUnit: number;    // costo nuestro por unidad (no se muestra al cliente)
  precioUnit: number;   // precio de venta por unidad (sí se muestra)
  notas?: string;
}

const TIPO_LABELS: Record<TipoPresupuesto, string> = {
  catering: "🍱 Catering a domicilio",
  evento_local: "🏠 Evento en el local",
  a_medida: "✨ A medida",
};

function fmt(n: number): string {
  return "$" + (n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function uid(): string {
  return Math.random().toString(36).substring(2, 9);
}

interface PlatoCosteado {
  plato: string;
  costoTotal: number;
  precioMenu: number;
  precioRedondeado: number;
}

/**
 * Mapeo de secciones plurales (como aparecen en la carta) a su forma singular
 * para construir descripciones tipo "Ceviche de Wasabi", "Handroll de Shiromi".
 */
const SECTION_SINGULAR: Record<string, string> = {
  ceviches: "Ceviche",
  handrolls: "Handroll",
  "hand rolls": "Handroll",
  niguiris: "Niguiri",
  nigiris: "Nigiri",
  sashimis: "Sashimi",
  rolls: "Roll",
  makis: "Maki",
  tatakis: "Tataki",
  tiraditos: "Tiradito",
  gunkans: "Gunkan",
  tartares: "Tartar",
  tartars: "Tartar",
  carpaccios: "Carpaccio",
  woks: "Wok",
  sopas: "Sopa",
  ensaladas: "Ensalada",
  entradas: "Entrada",
  postres: "Postre",
  tragos: "Trago",
  cervezas: "Cerveza",
  vinos: "Vino",
  bebidas: "Bebida",
  champagnes: "Champagne",
  espumantes: "Espumante",
  cocteles: "Coctel",
  cócteles: "Coctel",
  jugos: "Jugo",
  cafes: "Café",
  cafés: "Café",
};

/**
 * Construye un nombre descriptivo combinando sección + item.
 * Ejemplo: ("Ceviches", "Wasabi") → "Ceviche de Wasabi"
 *          ("Handrolls", "Shiromi") → "Handroll de Shiromi"
 * Si la sección no tiene singular conocido y no termina en s, usa "{section} - {name}".
 * Si el item.name ya contiene la palabra de la sección, devuelve solo el name.
 */
function buildItemDisplayName(section: string | undefined, name: string): string {
  if (!section) return name;
  const sectionLower = section.toLowerCase().trim();
  // Si el item.name ya empieza con el singular o la palabra clave, no duplicar
  const nameLower = name.toLowerCase();
  // 1. Match exacto en mapeo
  const singular = SECTION_SINGULAR[sectionLower];
  if (singular) {
    // Evitar duplicar si el nombre ya contiene el tipo
    if (nameLower.includes(singular.toLowerCase())) return name;
    return `${singular} de ${name}`;
  }
  // 2. Singularizar genericamente
  let s = section;
  if (sectionLower.endsWith("es") && sectionLower.length > 3) s = section.slice(0, -2);
  else if (sectionLower.endsWith("s") && sectionLower.length > 2) s = section.slice(0, -1);
  if (s !== section) {
    if (nameLower.includes(s.toLowerCase())) return name;
    return `${s} de ${name}`;
  }
  // 3. No singularizable: separar con " - "
  return `${section} - ${name}`;
}

/**
 * Normaliza para matching (igual que la lib).
 */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findCostByName(platos: PlatoCosteado[], name: string): PlatoCosteado | null {
  if (!name || platos.length === 0) return null;
  const norm = normalizeName(name);
  if (!norm) return null;
  // 1. Exact
  for (const p of platos) {
    if (normalizeName(p.plato) === norm) return p;
  }
  // 2. Contains
  for (const p of platos) {
    const platoNorm = normalizeName(p.plato);
    if (platoNorm.includes(norm) || norm.includes(platoNorm)) return p;
  }
  // 3. Word overlap (>=2 palabras > 3 chars)
  const inputWords = norm.split(" ").filter((w) => w.length > 3);
  if (inputWords.length === 0) return null;
  let bestScore = 0;
  let bestMatch: PlatoCosteado | null = null;
  for (const p of platos) {
    const platoWords = normalizeName(p.plato).split(" ").filter((w) => w.length > 3);
    const common = inputWords.filter((w) => platoWords.includes(w)).length;
    if (common > bestScore && common >= 2) {
      bestScore = common;
      bestMatch = p;
    }
  }
  return bestMatch;
}

export default function PresupuestoPage() {
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [costeoPlatos, setCosteoPlatos] = useState<PlatoCosteado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Header / datos generales
  const [tipo, setTipo] = useState<TipoPresupuesto>("catering");
  const [cliente, setCliente] = useState("");
  const [contactoCliente, setContactoCliente] = useState("");
  const [fechaEvento, setFechaEvento] = useState("");
  const [comensales, setComensales] = useState<number>(10);
  const [direccion, setDireccion] = useState("");
  const [notasGenerales, setNotasGenerales] = useState("");

  // Items del presupuesto
  const [items, setItems] = useState<PresupuestoItem[]>([]);

  // Extras (servicio, traslado, etc)
  const [extras, setExtras] = useState<PresupuestoItem[]>([]);

  // Vajilla
  const [conVajilla, setConVajilla] = useState(false);
  const [costoVajilla, setCostoVajilla] = useState(0);
  const [precioVajilla, setPrecioVajilla] = useState(0);
  const [notasVajilla, setNotasVajilla] = useState("");

  // Markup default
  const [markupPct, setMarkupPct] = useState(40); // % default para sugerir precio sobre costo

  // Item picker
  const [searchPicker, setSearchPicker] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Validity
  const [validez, setValidez] = useState("7 días");

  useEffect(() => {
    // Cargar menu + costeo en paralelo
    Promise.all([
      fetch("/api/menu/save").then((r) => r.json()),
      fetch("/api/erp/presupuesto/costos").then((r) => r.json()).catch(() => ({ platos: [] })),
    ])
      .then(([menuRes, costeoRes]) => {
        if (menuRes.error) throw new Error(menuRes.error);
        setMenuData(menuRes);
        if (Array.isArray(costeoRes.platos)) setCosteoPlatos(costeoRes.platos);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Cerrar picker al click fuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Lista plana de items del menú
  const flatMenuItems: MenuItem[] = useMemo(() => {
    if (!menuData) return [];
    const out: MenuItem[] = [];
    for (const page of menuData.pages) {
      for (const section of page.sections) {
        for (const item of section.items) {
          out.push({
            ...item,
            sectionTitle: section.title,
            pageTitle: page.title,
          });
        }
      }
    }
    return out;
  }, [menuData]);

  const filteredMenuItems = useMemo(() => {
    const q = searchPicker.trim().toLowerCase();
    if (!q) return flatMenuItems.slice(0, 50);
    return flatMenuItems
      .filter((it) => {
        return (
          it.name.toLowerCase().includes(q) ||
          (it.description || "").toLowerCase().includes(q) ||
          (it.sectionTitle || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [flatMenuItems, searchPicker]);

  const addMenuItem = (it: MenuItem) => {
    // Construir nombre descriptivo: "Ceviche de Wasabi" en lugar de solo "Wasabi"
    const displayName = buildItemDisplayName(it.sectionTitle, it.name);
    // Buscar costo: probar primero con el nombre completo, después con name solo
    const costMatch = findCostByName(costeoPlatos, displayName) || findCostByName(costeoPlatos, it.name);
    const newItem: PresupuestoItem = {
      id: uid(),
      menuItemId: it.id,
      nombre: displayName,
      cantidad: comensales || 1,
      unidad: "unidad",
      costoUnit: costMatch ? Math.round(costMatch.costoTotal) : 0,
      precioUnit: it.price || 0, // sugerimos el precio del menu
      notas: it.description || "",
    };
    setItems((prev) => [...prev, newItem]);
    setSearchPicker("");
    setPickerOpen(false);
  };

  const addCustomItem = () => {
    setItems((prev) => [
      ...prev,
      { id: uid(), nombre: "", cantidad: 1, unidad: "unidad", costoUnit: 0, precioUnit: 0, notas: "" },
    ]);
  };

  const addExtra = () => {
    setExtras((prev) => [
      ...prev,
      { id: uid(), nombre: "", cantidad: 1, unidad: "unidad", costoUnit: 0, precioUnit: 0, notas: "" },
    ]);
  };

  const updateItem = (id: string, patch: Partial<PresupuestoItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const updateExtra = (id: string, patch: Partial<PresupuestoItem>) => {
    setExtras((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));
  const removeExtra = (id: string) => setExtras((prev) => prev.filter((it) => it.id !== id));

  // Totales
  const subtotalCostoItems = useMemo(() => items.reduce((s, it) => s + it.costoUnit * it.cantidad, 0), [items]);
  const subtotalPrecioItems = useMemo(() => items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0), [items]);
  const subtotalCostoExtras = useMemo(() => extras.reduce((s, it) => s + it.costoUnit * it.cantidad, 0), [extras]);
  const subtotalPrecioExtras = useMemo(() => extras.reduce((s, it) => s + it.precioUnit * it.cantidad, 0), [extras]);
  const costoVaj = conVajilla ? costoVajilla : 0;
  const precioVaj = conVajilla ? precioVajilla : 0;
  const totalCosto = subtotalCostoItems + subtotalCostoExtras + costoVaj;
  const totalPrecio = subtotalPrecioItems + subtotalPrecioExtras + precioVaj;
  const ganancia = totalPrecio - totalCosto;
  const margenPct = totalPrecio > 0 ? (ganancia / totalPrecio) * 100 : 0;
  const markupAplicado = totalCosto > 0 ? (ganancia / totalCosto) * 100 : 0;

  // Auto-sugerencia: aplica markup a todos los items
  const applyMarkupAll = () => {
    setItems((prev) => prev.map((it) => ({
      ...it,
      precioUnit: Math.round(it.costoUnit * (1 + markupPct / 100)),
    })));
    setExtras((prev) => prev.map((it) => ({
      ...it,
      precioUnit: Math.round(it.costoUnit * (1 + markupPct / 100)),
    })));
    if (conVajilla && costoVajilla > 0) {
      setPrecioVajilla(Math.round(costoVajilla * (1 + markupPct / 100)));
    }
  };

  const generatePDF = async () => {
    const { jsPDF } = await import("jspdf");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const autoTableMod: any = await import("jspdf-autotable");
    const autoTable = autoTableMod.default || autoTableMod.autoTable || autoTableMod;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Header
    doc.setFontSize(20);
    doc.setTextColor(46, 109, 164);
    doc.text("MASUNORI", 20, 25);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text("Presupuesto", 20, 32);

    doc.setTextColor(60);
    doc.setFontSize(9);
    doc.text(`Tipo: ${TIPO_LABELS[tipo].replace(/[🍱🏠✨]\s?/g, "")}`, 130, 25);
    doc.text(`Fecha emisión: ${new Date().toLocaleDateString("es-AR")}`, 130, 30);
    doc.text(`Validez: ${validez}`, 130, 35);
    if (fechaEvento) doc.text(`Fecha del evento: ${new Date(fechaEvento + "T00:00:00").toLocaleDateString("es-AR")}`, 130, 40);

    // Cliente
    let y = 50;
    doc.setFontSize(11);
    doc.setTextColor(46, 109, 164);
    doc.text("Cliente", 20, y);
    y += 5;
    doc.setFontSize(10);
    doc.setTextColor(40);
    if (cliente) { doc.text(`Nombre: ${cliente}`, 20, y); y += 5; }
    if (contactoCliente) { doc.text(`Contacto: ${contactoCliente}`, 20, y); y += 5; }
    if (direccion) { doc.text(`Dirección: ${direccion}`, 20, y); y += 5; }
    if (comensales) { doc.text(`Comensales: ${comensales}`, 20, y); y += 5; }

    y += 5;

    // Items table
    const itemsTableData = items
      .filter((it) => it.nombre.trim())
      .map((it) => [
        it.nombre,
        `${it.cantidad} ${it.unidad || ""}`,
        fmt(it.precioUnit),
        fmt(it.precioUnit * it.cantidad),
      ]);

    if (itemsTableData.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Descripción", "Cantidad", "Precio unitario", "Subtotal"]],
        body: itemsTableData,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [46, 109, 164], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { halign: "center", cellWidth: 30 },
          2: { halign: "right", cellWidth: 35 },
          3: { halign: "right", cellWidth: 35, fontStyle: "bold" },
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 5;
    }

    // Vajilla
    if (conVajilla && precioVaj > 0) {
      autoTable(doc, {
        startY: y,
        body: [["Vajilla / Servicio de mesa" + (notasVajilla ? ` (${notasVajilla})` : ""), "", "", fmt(precioVaj)]],
        theme: "plain",
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 110 },
          3: { halign: "right", cellWidth: 35, fontStyle: "bold" },
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 2;
    }

    // Extras
    const extrasTableData = extras
      .filter((it) => it.nombre.trim())
      .map((it) => [
        it.nombre,
        `${it.cantidad} ${it.unidad || ""}`,
        fmt(it.precioUnit),
        fmt(it.precioUnit * it.cantidad),
      ]);

    if (extrasTableData.length > 0) {
      doc.setFontSize(10);
      doc.setTextColor(46, 109, 164);
      doc.text("Adicionales", 20, y + 3);
      y += 5;
      autoTable(doc, {
        startY: y,
        head: [["Descripción", "Cantidad", "Precio unitario", "Subtotal"]],
        body: extrasTableData,
        theme: "striped",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [100, 116, 139], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { halign: "center", cellWidth: 30 },
          2: { halign: "right", cellWidth: 35 },
          3: { halign: "right", cellWidth: 35, fontStyle: "bold" },
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 5;
    }

    // Total
    autoTable(doc, {
      startY: y,
      body: [["TOTAL", fmt(totalPrecio)]],
      theme: "grid",
      styles: { fontSize: 13, fontStyle: "bold", textColor: 255, fillColor: [46, 109, 164] },
      columnStyles: {
        0: { cellWidth: 145 },
        1: { halign: "right", cellWidth: 35 },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;

    // Notas
    if (notasGenerales) {
      doc.setFontSize(10);
      doc.setTextColor(46, 109, 164);
      doc.text("Notas / Condiciones", 20, y);
      y += 5;
      doc.setFontSize(9);
      doc.setTextColor(60);
      const lines = doc.splitTextToSize(notasGenerales, 170);
      doc.text(lines, 20, y);
      y += lines.length * 4 + 5;
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Masunori · presupuesto sujeto a confirmación", 20, 285);
    doc.text(new Date().toLocaleString("es-AR"), 165, 285);

    const filename = `Presupuesto-${(cliente || "cliente").replace(/[^a-zA-Z0-9]/g, "_")}-${new Date().toISOString().substring(0, 10)}.pdf`;
    doc.save(filename);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/administracion" className="text-sm text-gray-400 hover:text-blue-accent">
          ← Volver a Administración
        </Link>
        <h1 className="text-2xl font-bold text-navy mt-2">📝 Presupuestos</h1>
        <p className="text-xs text-gray-400 mt-1">
          Cotizá catering, eventos en el local o eventos a medida. El costo es interno (vos lo ponés a mano);
          el precio es el que el cliente ve en el PDF.
        </p>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm mb-3">⚠️ {error}</div>}

      {/* Status del costeo */}
      <div className={`border rounded-lg p-2.5 mb-3 text-xs flex items-center justify-between flex-wrap gap-2 ${
        costeoPlatos.length > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
      }`}>
        <span>
          {costeoPlatos.length > 0
            ? <>✓ Conectado a <b>MASUNORI_COSTEO_DASHBOARD</b> · {costeoPlatos.length} platos costeados. El costo se pre-llena automáticamente al agregar items de la carta.</>
            : "⚠️ No se pudo cargar el archivo de costeo. Los costos los vas a tener que poner a mano."}
        </span>
        <button
          onClick={() => {
            setLoading(true);
            fetch("/api/erp/presupuesto/costos")
              .then((r) => r.json())
              .then((d) => {
                if (Array.isArray(d.platos)) setCosteoPlatos(d.platos);
              })
              .finally(() => setLoading(false));
          }}
          disabled={loading}
          className="text-[11px] underline hover:opacity-70"
        >
          ↻ recargar
        </button>
      </div>

      {/* TIPO + DATOS GENERALES */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-semibold text-navy uppercase mb-3">Datos generales</h2>

        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(TIPO_LABELS) as TipoPresupuesto[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition ${
                tipo === t ? "border-blue-accent bg-blue-50 text-blue-accent" : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {TIPO_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] text-gray-500 uppercase block mb-1">Cliente</label>
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 uppercase block mb-1">Contacto</label>
            <input
              type="text"
              value={contactoCliente}
              onChange={(e) => setContactoCliente(e.target.value)}
              placeholder="Teléfono / email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 uppercase block mb-1">Fecha del evento</label>
            <input
              type="date"
              value={fechaEvento}
              onChange={(e) => setFechaEvento(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 uppercase block mb-1">Comensales</label>
            <input
              type="number"
              value={comensales}
              onChange={(e) => setComensales(parseInt(e.target.value) || 0)}
              min="1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
          {tipo === "catering" && (
            <div className="md:col-span-2">
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Dirección entrega</label>
              <input
                type="text"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Dirección + datos del evento"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
              />
            </div>
          )}
          <div>
            <label className="text-[11px] text-gray-500 uppercase block mb-1">Validez del presupuesto</label>
            <input
              type="text"
              value={validez}
              onChange={(e) => setValidez(e.target.value)}
              placeholder="ej 7 días"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
            />
          </div>
        </div>
      </div>

      {/* MARKUP CONTROL */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-blue-900 font-medium">Markup sugerido sobre costo:</span>
        <input
          type="number"
          value={markupPct}
          onChange={(e) => setMarkupPct(parseInt(e.target.value) || 0)}
          min="0"
          max="500"
          className="w-20 border border-blue-200 rounded-lg px-2 py-1 text-sm bg-white"
        />
        <span className="text-xs text-blue-900">%</span>
        <button
          onClick={applyMarkupAll}
          className="ml-auto text-xs bg-blue-accent text-white px-3 py-1.5 rounded-lg hover:bg-blue-accent/90"
        >
          Aplicar {markupPct}% a todos los items
        </button>
        <span className="text-[11px] text-blue-700">
          (precio sugerido = costo × (1 + {markupPct}/100))
        </span>
      </div>

      {/* ITEMS — picker + tabla */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-navy uppercase">Items del presupuesto</h2>
          <div className="flex gap-2">
            <button
              onClick={addCustomItem}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
            >
              + Item libre
            </button>
          </div>
        </div>

        {/* Picker de carta */}
        <div ref={pickerRef} className="relative mb-3">
          <input
            type="text"
            value={searchPicker}
            onChange={(e) => { setSearchPicker(e.target.value); setPickerOpen(true); }}
            onFocus={() => setPickerOpen(true)}
            placeholder="🔍 Buscar item de la carta para agregar..."
            disabled={loading}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent disabled:opacity-50"
          />
          {pickerOpen && filteredMenuItems.length > 0 && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
              {filteredMenuItems.map((it) => {
                const displayName = buildItemDisplayName(it.sectionTitle, it.name);
                const cm = findCostByName(costeoPlatos, displayName) || findCostByName(costeoPlatos, it.name);
                return (
                  <button
                    key={it.id}
                    onClick={() => addMenuItem(it)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-navy truncate">
                          {displayName}
                          {cm && (
                            <span className="ml-1.5 text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-normal" title={`Costo: ${fmt(cm.costoTotal)}`}>
                              ✓ costeado
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {it.pageTitle} · {it.sectionTitle}
                          {it.description ? ` · ${it.description}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono text-gray-500">{fmt(it.price)}</div>
                        {cm && <div className="text-[10px] text-amber-600 font-mono">costo {fmt(cm.costoTotal)}</div>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Tabla de items */}
        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
            Sin items todavía. Buscá en la carta o agregá un item libre.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-[10px]">
                  <th className="px-2 py-2 text-left">Descripción</th>
                  <th className="px-2 py-2 text-right w-20">Cant.</th>
                  <th className="px-2 py-2 text-right w-28">Costo unit.</th>
                  <th className="px-2 py-2 text-right w-28">Precio unit.</th>
                  <th className="px-2 py-2 text-right w-28">Subt. precio</th>
                  <th className="px-2 py-2 text-right w-20">Margen</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const subtPrecio = it.precioUnit * it.cantidad;
                  const subtCosto = it.costoUnit * it.cantidad;
                  const marg = subtPrecio > 0 ? ((subtPrecio - subtCosto) / subtPrecio) * 100 : 0;
                  return (
                    <tr key={it.id} className="border-b border-gray-100">
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={it.nombre}
                          onChange={(e) => updateItem(it.id, { nombre: e.target.value })}
                          placeholder="Descripción"
                          className="w-full border-0 bg-transparent text-sm focus:outline-none focus:bg-blue-50 px-1 py-0.5 rounded"
                        />
                        {it.notas && <div className="text-[10px] text-gray-400 px-1 truncate" title={it.notas}>{it.notas}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          value={it.cantidad}
                          onChange={(e) => updateItem(it.id, { cantidad: parseFloat(e.target.value) || 0 })}
                          className="w-16 text-right border border-gray-200 rounded px-1 py-0.5 text-sm focus:outline-none focus:border-blue-accent"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          value={it.costoUnit || ""}
                          onChange={(e) => updateItem(it.id, { costoUnit: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-24 text-right border border-amber-200 bg-amber-50/30 rounded px-1 py-0.5 text-sm focus:outline-none focus:border-amber-400 font-mono"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          value={it.precioUnit || ""}
                          onChange={(e) => updateItem(it.id, { precioUnit: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-24 text-right border border-emerald-200 bg-emerald-50/30 rounded px-1 py-0.5 text-sm focus:outline-none focus:border-emerald-400 font-mono"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-navy">{fmt(subtPrecio)}</td>
                      <td className={`px-2 py-1.5 text-right text-xs font-medium ${marg >= 30 ? "text-emerald-600" : marg >= 15 ? "text-amber-600" : "text-red-600"}`}>
                        {marg.toFixed(0)}%
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => removeItem(it.id)}
                          className="text-gray-400 hover:text-red-500 text-base"
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-sm">
                  <td className="px-2 py-2" colSpan={2}>Subtotal items</td>
                  <td className="px-2 py-2 text-right font-mono text-amber-700">{fmt(subtotalCostoItems)}</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-700"></td>
                  <td className="px-2 py-2 text-right font-mono text-navy">{fmt(subtotalPrecioItems)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* VAJILLA */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={conVajilla}
            onChange={(e) => setConVajilla(e.target.checked)}
            className="cursor-pointer"
          />
          <span className="text-sm font-semibold text-navy">🍽️ Incluir vajilla / servicio de mesa</span>
        </label>
        {conVajilla && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Costo total vajilla</label>
              <input
                type="number"
                value={costoVajilla || ""}
                onChange={(e) => setCostoVajilla(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full border border-amber-200 bg-amber-50/30 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Precio cliente</label>
              <input
                type="number"
                value={precioVajilla || ""}
                onChange={(e) => setPrecioVajilla(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full border border-emerald-200 bg-emerald-50/30 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">Notas</label>
              <input
                type="text"
                value={notasVajilla}
                onChange={(e) => setNotasVajilla(e.target.value)}
                placeholder="ej platos + cubiertos + copas"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* EXTRAS */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-navy uppercase">Adicionales</h2>
          <button
            onClick={addExtra}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg"
          >
            + Agregar
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">
          Servicio de mozos, traslado, decoración, sonido, alquileres... cualquier cosa fuera de la comida.
        </p>
        {extras.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
            Sin adicionales
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 uppercase text-[10px]">
                  <th className="px-2 py-2 text-left">Descripción</th>
                  <th className="px-2 py-2 text-right w-20">Cant.</th>
                  <th className="px-2 py-2 text-right w-28">Costo unit.</th>
                  <th className="px-2 py-2 text-right w-28">Precio unit.</th>
                  <th className="px-2 py-2 text-right w-28">Subt. precio</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {extras.map((it) => (
                  <tr key={it.id} className="border-b border-gray-100">
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={it.nombre}
                        onChange={(e) => updateExtra(it.id, { nombre: e.target.value })}
                        placeholder="ej Servicio de mozos, Traslado..."
                        className="w-full border-0 bg-transparent text-sm focus:outline-none focus:bg-blue-50 px-1 py-0.5 rounded"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        value={it.cantidad}
                        onChange={(e) => updateExtra(it.id, { cantidad: parseFloat(e.target.value) || 0 })}
                        className="w-16 text-right border border-gray-200 rounded px-1 py-0.5 text-sm"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        value={it.costoUnit || ""}
                        onChange={(e) => updateExtra(it.id, { costoUnit: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-24 text-right border border-amber-200 bg-amber-50/30 rounded px-1 py-0.5 text-sm font-mono"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        value={it.precioUnit || ""}
                        onChange={(e) => updateExtra(it.id, { precioUnit: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-24 text-right border border-emerald-200 bg-emerald-50/30 rounded px-1 py-0.5 text-sm font-mono"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold text-navy">
                      {fmt(it.precioUnit * it.cantidad)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => removeExtra(it.id)} className="text-gray-400 hover:text-red-500">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NOTAS GENERALES */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <label className="text-sm font-semibold text-navy uppercase block mb-2">Notas / Condiciones del presupuesto</label>
        <textarea
          value={notasGenerales}
          onChange={(e) => setNotasGenerales(e.target.value)}
          rows={3}
          placeholder="Condiciones, forma de pago, aclaraciones, etc. Se incluyen en el PDF."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent resize-y"
        />
      </div>

      {/* TOTALES + ACCIONES */}
      <div className="bg-gradient-to-r from-blue-50 to-emerald-50 border-2 border-blue-accent rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <div className="text-[10px] text-amber-700 uppercase font-semibold">Costo total (interno)</div>
            <div className="text-xl font-bold text-amber-800 font-mono">{fmt(totalCosto)}</div>
          </div>
          <div>
            <div className="text-[10px] text-emerald-700 uppercase font-semibold">Precio total (cliente)</div>
            <div className="text-xl font-bold text-emerald-800 font-mono">{fmt(totalPrecio)}</div>
          </div>
          <div>
            <div className="text-[10px] text-blue-accent uppercase font-semibold">Ganancia bruta</div>
            <div className="text-xl font-bold text-blue-accent font-mono">{fmt(ganancia)}</div>
          </div>
          <div>
            <div className="text-[10px] text-navy uppercase font-semibold">Margen</div>
            <div className={`text-xl font-bold font-mono ${margenPct >= 30 ? "text-emerald-700" : margenPct >= 15 ? "text-amber-700" : "text-red-700"}`}>
              {margenPct.toFixed(1)}%
            </div>
            <div className="text-[10px] text-gray-500">markup: {markupAplicado.toFixed(0)}%</div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={generatePDF}
            disabled={items.length === 0 && extras.length === 0 && !precioVaj}
            className="bg-blue-accent text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-accent/90 transition disabled:opacity-50"
          >
            📄 Generar PDF del presupuesto
          </button>
          <span className="text-[11px] text-gray-500">
            El PDF muestra <b className="text-emerald-700">solo precios al cliente</b> (no costos).
          </span>
        </div>
      </div>
    </div>
  );
}
