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

interface UltimaCompra {
  insumo: string;
  insumoOriginal: string;
  proveedor: string;
  sucursal: string;
  fechaISO: string | null;
  fechaSheet: string;
  precioUnit: number;
  total: number;
  cantidad: number;
  rownum: number;
}

interface SalsaCosteo {
  nombre: string;
  costoLote: number;
  rindeGr: number;
  costoPorGr: number;
  alergiasInfo: string;
}

function normalizeInsumoLocal(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findUltimoPrecioLocal(list: UltimaCompra[], insumoQuery: string): UltimaCompra | null {
  const norm = normalizeInsumoLocal(insumoQuery);
  if (!norm) return null;
  for (const c of list) if (c.insumo === norm) return c;
  for (const c of list) if (c.insumo.includes(norm) || norm.includes(c.insumo)) return c;
  const inputWords = norm.split(" ").filter((w) => w.length > 3);
  if (inputWords.length === 0) return null;
  let best: UltimaCompra | null = null;
  let bestScore = 0;
  for (const c of list) {
    const keyWords = c.insumo.split(" ").filter((w) => w.length > 3);
    const common = inputWords.filter((w) => keyWords.includes(w)).length;
    if (common > bestScore && common >= 2) {
      bestScore = common;
      best = c;
    }
  }
  return best;
}

export default function PresupuestoPage() {
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [costeoPlatos, setCosteoPlatos] = useState<PlatoCosteado[]>([]);
  const [salsasCosteo, setSalsasCosteo] = useState<SalsaCosteo[]>([]);
  const [ultimosPrecios, setUltimosPrecios] = useState<UltimaCompra[]>([]);
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

  // Food cost objetivo: % que el costo representa sobre el precio de venta.
  // Ej. food cost = 15% → costo es 15% del precio → precio = costo / 0.15
  // Default 15% (es lo típico de Masunori según la planilla COSTEO).
  const [foodCostPct, setFoodCostPct] = useState(15);

  // Diseño del PDF — campos opcionales editables
  const [frasePDF, setFrasePDF] = useState(
    "Cada pieza es una declaración de excelencia. Gracias por permitirnos ser parte de este momento único."
  );
  const [descuentoPct, setDescuentoPct] = useState(0);
  const [mostrarSena, setMostrarSena] = useState(true);
  const [senaPct, setSenaPct] = useState(50);
  const [importanteSaber, setImportanteSaber] = useState(
    "- Si se modifica la cantidad de invitados, informar con al menos 48 horas de anticipación.\n" +
    "- Cancelaciones con 5 días o más: devolución del 50% de la seña. Con menos de 5 días, la seña cubre costos operativos y reserva de fecha."
  );
  const [comoFunciona, setComoFunciona] = useState(
    "- El evento tiene una duración de 3 horas.\n" +
    "- El personal se presenta una hora antes para preparar los emplatados y las decoraciones. También se deja lista la barra de servicios asignada.\n" +
    "- A veinte minutos de la bajada de platos de las mesas, se comienza el servicio de handrolls."
  );
  const [formasPago, setFormasPago] = useState(
    "Efectivo (ARS/USD) · Transferencia bancaria · Tarjetas de crédito o débito.\n" +
    "Los valores no incluyen IVA.\n" +
    "La propina no está contemplada en el presupuesto. Sugerimos un 10% del total, únicamente en efectivo."
  );
  const [pdfOptOpen, setPdfOptOpen] = useState(false);

  // Item picker
  const [searchPicker, setSearchPicker] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Validity
  const [validez, setValidez] = useState("7 días");

  useEffect(() => {
    // Cargar menu + costeo + ultimos precios en paralelo
    Promise.all([
      fetch("/api/menu/save").then((r) => r.json()),
      fetch("/api/erp/presupuesto/costos").then((r) => r.json()).catch(() => ({ platos: [] })),
      fetch("/api/erp/presupuesto/ultimos-precios?year=2026").then((r) => r.json()).catch(() => ({ ultimosPrecios: [] })),
    ])
      .then(([menuRes, costeoRes, ultRes]) => {
        if (menuRes.error) throw new Error(menuRes.error);
        setMenuData(menuRes);
        if (Array.isArray(costeoRes.platos)) setCosteoPlatos(costeoRes.platos);
        if (Array.isArray(costeoRes.salsas)) setSalsasCosteo(costeoRes.salsas);
        if (Array.isArray(ultRes.ultimosPrecios)) setUltimosPrecios(ultRes.ultimosPrecios);
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
  const foodCostAplicado = totalPrecio > 0 ? (totalCosto / totalPrecio) * 100 : 0;

  // Auto-sugerencia: aplica food cost objetivo a todos los items.
  // Si food cost = 15%, entonces precio = costo / 0.15 (= costo × 6.67).
  const applyFoodCostAll = () => {
    if (foodCostPct <= 0 || foodCostPct >= 100) return;
    const factor = 100 / foodCostPct;
    setItems((prev) => prev.map((it) => ({
      ...it,
      precioUnit: it.costoUnit > 0 ? Math.round(it.costoUnit * factor) : it.precioUnit,
    })));
    setExtras((prev) => prev.map((it) => ({
      ...it,
      precioUnit: it.costoUnit > 0 ? Math.round(it.costoUnit * factor) : it.precioUnit,
    })));
    if (conVajilla && costoVajilla > 0) {
      setPrecioVajilla(Math.round(costoVajilla * factor));
    }
  };

  const generatePDF = async () => {
    const { jsPDF } = await import("jspdf");

    // ─── LANDSCAPE A4 con fondo rosa estilo Masunori ───
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = 297; // ancho
    const H = 210; // alto
    const PINK_R = 244, PINK_G = 215, PINK_B = 210; // #F4D7D2

    const pinkBg = () => {
      doc.setFillColor(PINK_R, PINK_G, PINK_B);
      doc.rect(0, 0, W, H, "F");
    };

    // Cargar ambos logos (isologo bonsai + wordmark Masunori cursivo)
    const loadImage = async (url: string): Promise<{ dataUrl: string; aspectRatio: number } | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        // Calcular aspect ratio
        const aspectRatio = await new Promise<number>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.width / img.height);
          img.onerror = () => resolve(1);
          img.src = dataUrl;
        });
        return { dataUrl, aspectRatio };
      } catch {
        return null;
      }
    };

    const isologo = await loadImage("/masunori-isologo.png");
    const wordmark = await loadImage("/masunori-wordmark.png");

    // Dibuja el isologo (bonsai). Tiene aspect ratio vertical (alto > ancho).
    const drawIsologo = (cx: number, cy: number, height = 22) => {
      if (isologo) {
        const w = height * isologo.aspectRatio;
        doc.addImage(isologo.dataUrl, "PNG", cx - w / 2, cy - height / 2, w, height);
      } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(height * 0.6);
        doc.setTextColor(30);
        doc.text("✦", cx, cy, { align: "center" });
      }
    };

    // Dibuja el wordmark "Masunori" en cursiva. Aspect ratio horizontal.
    const drawWordmark = (cx: number, cy: number, height = 18) => {
      if (wordmark) {
        const w = height * wordmark.aspectRatio;
        doc.addImage(wordmark.dataUrl, "PNG", cx - w / 2, cy - height / 2, w, height);
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(height * 1.4);
        doc.setTextColor(30);
        doc.text("Masunori", cx, cy + height * 0.3, { align: "center" });
      }
    };

    // Direcciones (footer comun)
    const drawAddresses = (x: number, y: number) => {
      doc.setFontSize(7.5);
      doc.setTextColor(70);
      doc.setFont("helvetica", "bold");
      doc.text("Palermo", x, y);
      doc.setFont("helvetica", "normal");
      doc.text(" | Juan A. Buschiazzo 3043", x + 12, y);
      doc.setFont("helvetica", "bold");
      doc.text("Belgrano", x, y + 4);
      doc.setFont("helvetica", "normal");
      doc.text(" | Castañeda 1872", x + 13, y + 4);
      doc.setFont("helvetica", "bold");
      doc.text("Puerto Madero", x, y + 8);
      doc.setFont("helvetica", "normal");
      doc.text(" | Juana Manso 1810", x + 21, y + 8);
    };

    // Quote común (cursiva, sutil)
    const drawQuote = () => {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(70);
      const quoteLines = doc.splitTextToSize(`"${frasePDF}"`, 200);
      let yQ = 16;
      for (const line of quoteLines) {
        doc.text(line, W / 2, yQ, { align: "center" });
        yQ += 4.5;
      }
    };

    // Divider line — refinado
    const divider = (cx: number, y: number, width: number) => {
      doc.setDrawColor(140);
      doc.setLineWidth(0.2);
      doc.line(cx - width / 2, y, cx + width / 2, y);
    };

    // ═══════════════════════════════════════
    // PÁGINA 1
    // ═══════════════════════════════════════
    pinkBg();
    drawQuote();

    // Isologo bonsai top-right
    drawIsologo(W - 22, 26, 32);

    // Wordmark "Masunori" en cursiva como título central
    drawWordmark(W / 2, 50, 18);

    // Tipo de evento (subtítulo elegante con letter-spacing)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80);
    const subtitulo = "P R E S U P U E S T O   ·   " + (
      tipo === "catering" ? "C A T E R I N G" :
      tipo === "evento_local" ? "E V E N T O   E N   E L   L O C A L" :
      "A   M E D I D A"
    );
    doc.text(subtitulo, W / 2, 65, { align: "center" });

    // Divider después del header
    divider(W / 2, 72, 80);

    // Cliente
    if (cliente) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.text("Cliente   ·   " + cliente, W / 2, 81, { align: "center" });
    }

    // ─── Columna izquierda: MENÚ ───
    const colIzqCX = 80;
    let mY = 100;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text("M E N Ú", colIzqCX, mY, { align: "center" });
    divider(colIzqCX, mY + 3, 24);
    mY += 14;

    // Headers — más sutil
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text("PRODUCTO", colIzqCX - 35, mY);
    doc.text("UNIDADES", colIzqCX + 35, mY, { align: "right" });
    mY += 7;

    // Items
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(35);
    const validItems = items.filter((i) => i.nombre.trim());
    let totalUnidades = 0;
    for (const it of validItems) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(30);
      doc.text("•  " + it.nombre, colIzqCX - 35, mY);
      doc.text(String(it.cantidad), colIzqCX + 35, mY, { align: "right" });
      mY += 5;
      if (it.notas) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        doc.setTextColor(95);
        const noteLines = doc.splitTextToSize("(" + it.notas + ")", 60);
        for (const l of noteLines) {
          doc.text(l, colIzqCX - 31, mY);
          mY += 3.8;
        }
        doc.setFontSize(10.5);
        doc.setTextColor(30);
      }
      mY += 2;
      totalUnidades += it.cantidad || 0;
    }

    if (validItems.length > 0) {
      mY += 4;
      divider(colIzqCX, mY, 50);
      mY += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(50);
      doc.text(`Total · ${totalUnidades} unidades`, colIzqCX, mY, { align: "center" });
      mY += 14;
    }

    // Incluye
    const validExtras = extras.filter((e) => e.nombre.trim());
    if (validExtras.length > 0 || conVajilla) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30);
      doc.text("Incluye", colIzqCX, mY, { align: "center" });
      mY += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(50);
      for (const ex of validExtras) {
        doc.text(ex.nombre, colIzqCX, mY, { align: "center" });
        mY += 4.5;
      }
      if (conVajilla) {
        const vajText = notasVajilla ? `Vajilla — ${notasVajilla}` : "Vajilla";
        doc.text(vajText, colIzqCX, mY, { align: "center" });
        mY += 4.5;
      }
    }

    // ─── Columna derecha: VALOR ───
    const colDerCX = 210;
    let vY = 100;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(30);
    doc.text("V A L O R", colDerCX, vY, { align: "center" });
    divider(colDerCX, vY + 3, 24);
    vY += 18;

    const precioFinal = descuentoPct > 0 ? totalPrecio * (1 - descuentoPct / 100) : totalPrecio;

    if (descuentoPct > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(95);
      doc.text(`${fmt(totalPrecio)}   ·   ${descuentoPct}% off`, colDerCX, vY, { align: "center" });
      vY += 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(26);
      doc.setTextColor(20);
      doc.text(fmt(precioFinal), colDerCX, vY, { align: "center" });
      vY += 7;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text("sin IVA en efectivo", colDerCX, vY, { align: "center" });
      vY += 16;
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(20);
      doc.text(fmt(totalPrecio), colDerCX, vY + 4, { align: "center" });
      vY += 15;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text("sin IVA en efectivo", colDerCX, vY, { align: "center" });
      vY += 16;
    }

    if (mostrarSena && senaPct > 0) {
      const sena = precioFinal * (senaPct / 100);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80);
      doc.text("Para concretar la reserva", colDerCX, vY, { align: "center" });
      vY += 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(30);
      doc.text(fmt(sena), colDerCX, vY, { align: "center" });
      vY += 5;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(90);
      doc.text(`${senaPct}% de la seña · pago efectivo`, colDerCX, vY, { align: "center" });
    }

    // Info adicional bottom-left: tipo + fechas
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60);
    const metaY = H - 25;
    if (fechaEvento) {
      doc.text(`Fecha del evento: ${new Date(fechaEvento + "T00:00:00").toLocaleDateString("es-AR")}`, 20, metaY);
    }
    if (comensales) doc.text(`Comensales: ${comensales}`, 20, metaY + 4);
    if (contactoCliente) doc.text(`Contacto: ${contactoCliente}`, 20, metaY + 8);
    doc.text(`Validez: ${validez} · Emitido: ${new Date().toLocaleDateString("es-AR")}`, 20, metaY + 12);

    drawAddresses(W - 75, H - 18);

    // ═══════════════════════════════════════
    // PÁGINA 2 — Condiciones
    // ═══════════════════════════════════════
    doc.addPage();
    pinkBg();
    drawQuote();

    // Isologo también en página 2, top-right (consistente)
    drawIsologo(W - 22, 26, 32);

    let cY = 50;

    const drawSection = (titulo: string, contenido: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30);
      // Title con letter-spacing simulado
      const spaced = titulo.split("").join(" ");
      doc.text(spaced, W / 2, cY, { align: "center" });
      cY += 3;
      divider(W / 2, cY, 30);
      cY += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(55);
      const lines = doc.splitTextToSize(contenido, 220);
      for (const l of lines) {
        doc.text(l, W / 2, cY, { align: "center" });
        cY += 4.5;
      }
      cY += 8;
    };

    drawSection("IMPORTANTE SABER", importanteSaber);
    drawSection("CÓMO FUNCIONA", comoFunciona);
    drawSection("FORMAS DE PAGO", formasPago);

    if (notasGenerales) {
      drawSection("NOTAS ADICIONALES", notasGenerales);
    }

    // Wordmark Masunori centrado en cursiva (más elegante que el bonsai)
    drawWordmark(W / 2, 170, 14);

    // Footer
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(70);
    doc.text("eventos corporativos   ·   @masunorisushi", W / 2, 182, { align: "center" });

    drawAddresses(W - 75, H - 18);

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

      {/* Status del costeo + ultimos precios EGRESOS */}
      <div className={`border rounded-lg p-2.5 mb-3 text-xs ${
        costeoPlatos.length > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span>
            {costeoPlatos.length > 0
              ? <>✓ <b>MASUNORI_COSTEO_DASHBOARD</b>: {costeoPlatos.length} platos costeados (proteína + shari + salsas). Mermas verificadas: 79/81 fórmula correcta.</>
              : "⚠️ No se pudo cargar el archivo de costeo. Los costos los vas a tener que poner a mano."}
          </span>
          <button
            onClick={() => {
              setLoading(true);
              Promise.all([
                fetch("/api/erp/presupuesto/costos").then((r) => r.json()),
                fetch("/api/erp/presupuesto/ultimos-precios?year=2026").then((r) => r.json()),
              ])
                .then(([cR, uR]) => {
                  if (Array.isArray(cR.platos)) setCosteoPlatos(cR.platos);
                  if (Array.isArray(uR.ultimosPrecios)) setUltimosPrecios(uR.ultimosPrecios);
                })
                .finally(() => setLoading(false));
            }}
            disabled={loading}
            className="text-[11px] underline hover:opacity-70"
          >
            ↻ recargar todo
          </button>
        </div>
        {ultimosPrecios.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-emerald-200">
            💰 EGRESOS conectado: {ultimosPrecios.length} insumos con último precio pagado (Palermo/Belgrano/Madero 2026).
            Cuando agregás un item, te muestra <b>costo del costeo vs último precio pagado al proveedor</b>.
          </div>
        )}
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

      {/* FOOD COST CONTROL */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-900 font-medium">¿Con qué food cost % querés operar?</span>
          <input
            type="number"
            value={foodCostPct}
            onChange={(e) => setFoodCostPct(parseFloat(e.target.value) || 0)}
            min="1"
            max="99"
            step="0.5"
            className="w-20 border border-blue-200 rounded-lg px-2 py-1 text-sm bg-white font-mono"
          />
          <span className="text-xs text-blue-900">%</span>
        </div>
        <span className="text-[11px] text-blue-700 italic">
          ej {foodCostPct}% significa: costo = {foodCostPct}% del precio · precio = costo ÷ {(foodCostPct / 100).toFixed(2)} (× {foodCostPct > 0 ? (100 / foodCostPct).toFixed(2) : "?"})
        </span>
        <button
          onClick={applyFoodCostAll}
          disabled={foodCostPct <= 0 || foodCostPct >= 100}
          className="ml-auto text-xs bg-blue-accent text-white px-3 py-1.5 rounded-lg hover:bg-blue-accent/90 disabled:opacity-50"
        >
          Aplicar {foodCostPct}% food cost a todos los items
        </button>
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
                  <th className="px-2 py-2 text-right w-20">F.cost</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const subtPrecio = it.precioUnit * it.cantidad;
                  const subtCosto = it.costoUnit * it.cantidad;
                  const fcost = subtPrecio > 0 ? (subtCosto / subtPrecio) * 100 : 0;
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
                        {(() => {
                          // Ultimo precio pagado del insumo principal (proteína del plato)
                          const ult = findUltimoPrecioLocal(ultimosPrecios, it.nombre);
                          if (!ult) return null;
                          const diff = it.costoUnit > 0 ? ((it.costoUnit - ult.precioUnit) / it.costoUnit) * 100 : 0;
                          return (
                            <div
                              className="text-[9px] text-gray-500 mt-0.5"
                              title={`Último: ${ult.proveedor} (${ult.sucursal}) ${ult.fechaSheet} · $${Math.round(ult.precioUnit).toLocaleString("es-AR")}/${ult.cantidad}${ult.cantidad === 1 ? "u" : ""}`}
                            >
                              💰 últ pagado ${Math.round(ult.precioUnit).toLocaleString("es-AR")}
                              {it.costoUnit > 0 && Math.abs(diff) > 5 && (
                                <span className={diff < 0 ? "text-red-500 ml-1" : "text-emerald-600 ml-1"}>
                                  ({diff > 0 ? "−" : "+"}{Math.abs(diff).toFixed(0)}%)
                                </span>
                              )}
                            </div>
                          );
                        })()}
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
                      <td className={`px-2 py-1.5 text-right text-xs font-medium ${
                        fcost === 0 ? "text-gray-300" :
                        fcost <= 20 ? "text-emerald-600" :
                        fcost <= 35 ? "text-amber-600" : "text-red-600"
                      }`} title={subtPrecio > 0 ? `Costo es ${fcost.toFixed(1)}% del precio. Margen ${(100 - fcost).toFixed(1)}%` : ""}>
                        {fcost > 0 ? `${fcost.toFixed(0)}%` : "—"}
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

      {/* SALSAS Y TOPPINGS */}
      {salsasCosteo.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-navy uppercase">🧪 Salsas y toppings</h2>
            <span className="text-[11px] text-gray-500">{salsasCosteo.length} salsas costeadas en MASUNORI_COSTEO_DASHBOARD</span>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Agregá salsa/topping como adicional con costo por gramo del costeo. Sugerencia para handrolls: 30g de salsa de soja por persona.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {salsasCosteo.slice(0, 30).map((s) => (
              <button
                key={s.nombre}
                onClick={() => {
                  const gramos = comensales * 30; // sugerencia: 30g/persona
                  setExtras((prev) => [
                    ...prev,
                    {
                      id: uid(),
                      nombre: s.nombre + ` (${gramos}g)`,
                      cantidad: 1,
                      unidad: "lote",
                      costoUnit: Math.round(gramos * s.costoPorGr),
                      precioUnit: 0,
                      notas: `${gramos}g · $${s.costoPorGr.toFixed(2)}/g · rinde ${s.rindeGr}g por lote`,
                    },
                  ]);
                }}
                className="text-[11px] bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 px-2 py-1 rounded-md transition"
                title={`Costo: $${s.costoPorGr.toFixed(2)}/g · Lote $${s.costoLote.toFixed(0)} rinde ${s.rindeGr}g${s.alergiasInfo ? " · " + s.alergiasInfo : ""}`}
              >
                + {s.nombre.replace(/^SALSA\s+/i, "").substring(0, 25)}
                <span className="ml-1 text-amber-600 text-[10px] font-mono">${s.costoPorGr.toFixed(1)}/g</span>
              </button>
            ))}
          </div>
        </div>
      )}

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

      {/* DISEÑO DEL PDF (colapsable) */}
      <div className="bg-white border border-gray-200 rounded-xl mb-4">
        <button
          onClick={() => setPdfOptOpen(!pdfOptOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-navy uppercase hover:bg-gray-50 rounded-xl"
        >
          <span>📄 Diseño del PDF (descuento, seña, textos)</span>
          <span className="text-gray-400">{pdfOptOpen ? "▲" : "▼"}</span>
        </button>
        {pdfOptOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-gray-500 uppercase block mb-1">Descuento %</label>
                <input
                  type="number"
                  value={descuentoPct}
                  onChange={(e) => setDescuentoPct(parseFloat(e.target.value) || 0)}
                  min="0"
                  max="90"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <div className="text-[10px] text-gray-400 mt-0.5">aparece en PDF como &quot;30% off&quot;</div>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 uppercase block mb-1">Seña %</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={senaPct}
                    onChange={(e) => setSenaPct(parseFloat(e.target.value) || 0)}
                    min="0"
                    max="100"
                    disabled={!mostrarSena}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono disabled:opacity-50"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mostrarSena}
                    onChange={(e) => setMostrarSena(e.target.checked)}
                  />
                  Mostrar seña en el PDF
                </label>
              </div>
              <div>
                <label className="text-[11px] text-gray-500 uppercase block mb-1">Frase / Quote (top del PDF)</label>
                <textarea
                  value={frasePDF}
                  onChange={(e) => setFrasePDF(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">IMPORTANTE SABER</label>
              <textarea
                value={importanteSaber}
                onChange={(e) => setImportanteSaber(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">CÓMO FUNCIONA</label>
              <textarea
                value={comoFunciona}
                onChange={(e) => setComoFunciona(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase block mb-1">FORMAS DE PAGO</label>
              <textarea
                value={formasPago}
                onChange={(e) => setFormasPago(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
              />
            </div>
          </div>
        )}
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
            <div className="text-[10px] text-navy uppercase font-semibold">Food cost real</div>
            <div className={`text-xl font-bold font-mono ${
              foodCostAplicado === 0 ? "text-gray-300" :
              foodCostAplicado <= 20 ? "text-emerald-700" :
              foodCostAplicado <= 35 ? "text-amber-700" : "text-red-700"
            }`}>
              {foodCostAplicado > 0 ? `${foodCostAplicado.toFixed(1)}%` : "—"}
            </div>
            <div className="text-[10px] text-gray-500">margen: {margenPct.toFixed(1)}%</div>
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
