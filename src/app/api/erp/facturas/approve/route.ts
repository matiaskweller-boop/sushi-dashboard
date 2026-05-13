import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi, userHasPermission } from "@/lib/admin-permissions";
import { getFactura, updateFactura, FacturaQueue } from "@/lib/facturas-queue";
import { readSheetRaw, applyBackgroundColor, parseA1Range, getSheets } from "@/lib/google";
import { getAllMasterProveedores, MasterProveedor } from "@/lib/master-proveedores";

export const runtime = "nodejs";

/**
 * Encuentra la última fila con datos REALES en una columna específica de un tab.
 * Útil para appendear después de la última factura sin contar filas con fórmulas vacías.
 */
async function findLastDataRow(
  spreadsheetId: string,
  tabName: string,
  column: string,
  startSearchRow = 2,
): Promise<number> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName}'!${column}${startSearchRow}:${column}`,
  });
  const rows = res.data.values || [];
  // Buscar la última celda con texto que no sea vacío ni "0"
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = (rows[i]?.[0] || "").toString().trim();
    if (v && v !== "0" && v !== "$0,00" && v !== "$0") {
      return startSearchRow + i; // 1-indexed
    }
  }
  return startSearchRow - 1; // solo header, primera fila de data sería startSearchRow
}

/**
 * Append "inteligente" que encuentra la última fila con dato en col E (PROVEEDOR)
 * y escribe inmediatamente después usando update (no append-with-INSERT_ROWS).
 * Esto evita los gaps que aparecen cuando el sheet tiene fórmulas en filas vacías.
 */
/**
 * Resuelve el nombre del tab EGRESOS independientemente del casing.
 * Belgrano lo tiene como "Egresos" (mixed case), Palermo/Madero como "EGRESOS".
 */
async function resolveEgresosTabName(spreadsheetId: string): Promise<string> {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });
  const tab = meta.data.sheets?.find((s) => (s.properties?.title || "").toLowerCase() === "egresos");
  return tab?.properties?.title || "EGRESOS";
}

async function smartAppendToEgresos(
  spreadsheetId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _hint: string,
  values: string[][],
  razonSocialPropia?: string,
): Promise<string> {
  const sheets = getSheets();
  const tabName = await resolveEgresosTabName(spreadsheetId);
  // Buscar última fila con dato real en col E (PROVEEDOR)
  const lastDataRow = await findLastDataRow(spreadsheetId, tabName, "E", 2);
  const startRow = lastDataRow + 1;
  const endRow = startRow + values.length - 1;

  // Hacemos DOS escrituras separadas para no pisar la col W (Palermo tiene
  // formulas de "Numeracion" ahi):
  //   1. A:U → 21 cols principales con datos de la factura
  //   2. X:X → RAZON SOCIAL PROPIA (Tobet SRL / Pro Vegan SAS / Icono SAS)

  // 1. Write A:U
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A${startRow}:U${endRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  // 2. Write X:X con razon social propia (misma en todas las filas de la factura)
  if (razonSocialPropia) {
    const rowsX = values.map(() => [razonSocialPropia]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!X${startRow}:X${endRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rowsX },
    });
  }

  // Range principal para el coloring (solo cols A:U de la primera fila)
  return `'${tabName}'!A${startRow}:U${endRow}`;
}

const MES_NOMBRES = [
  "", "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function mesNombreFromIso(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^\d{4}-(\d{2})-\d{2}/);
  if (!m) return "";
  const idx = parseInt(m[1]);
  return MES_NOMBRES[idx] || "";
}

/**
 * Parsea "10 dias", "15 DIAS", "30 días", "7" → number of days, o "" si no se puede.
 */
function parsePlazo(plazoStr: string): string {
  if (!plazoStr) return "";
  const m = plazoStr.match(/(\d+)/);
  if (!m) return "";
  return m[1];
}

interface ProveedorPlazo {
  proveedor: string;
  plazo: string; // dias parsed
}

/**
 * Cargar plazos por proveedor desde DEUDA AL DIA, cache 10 min server-side.
 */
let plazoCache: { map: Map<string, string>; expiresAt: number } | null = null;
const PLAZO_TTL = 10 * 60 * 1000;

// Lista de RUBROS, INSUMOS y MÉTODOS DE PAGO desde DATOSSS (validaciones del sheet)
interface DatosssLists {
  rubros: string[];
  insumos: string[];
  metodosPago: string[];
  tiposComprobante: string[];
}
let datosssCache: { lists: DatosssLists; expiresAt: number } | null = null;
const DATOSSS_TTL = 10 * 60 * 1000;

async function loadDatosss(): Promise<DatosssLists> {
  if (datosssCache && datosssCache.expiresAt > Date.now()) return datosssCache.lists;
  const sheetId = process.env.SHEET_PALERMO_2026 || "";
  if (!sheetId) return { rubros: [], insumos: [], metodosPago: [], tiposComprobante: [] };
  try {
    const rows = await readSheetRaw(sheetId, "DATOSSS!A1:M500");
    const rubros = rows.slice(1).map((r) => (r[1] || "").toString().trim()).filter(Boolean);
    const insumos = rows.slice(1).map((r) => (r[3] || "").toString().trim()).filter(Boolean);
    const tiposComprobante = rows.slice(1).map((r) => (r[10] || "").toString().trim()).filter(Boolean);
    const metodosPago = rows.slice(1).map((r) => (r[11] || "").toString().trim()).filter(Boolean);
    const lists = { rubros, insumos, metodosPago, tiposComprobante };
    datosssCache = { lists, expiresAt: Date.now() + DATOSSS_TTL };
    return lists;
  } catch {
    return { rubros: [], insumos: [], metodosPago: [], tiposComprobante: [] };
  }
}

/**
 * Matchear un valor contra una lista de valores válidos:
 * 1. exact match (case-insensitive)
 * 2. contains match (uno contiene al otro)
 * 3. fuzzy por palabras comunes
 *
 * Si no hay match razonable, devuelve el valor original (o "" si vacío).
 */
function findBestMatch(value: string, list: string[]): string {
  if (!value) return "";
  const v = value.trim();
  if (!v || list.length === 0) return v;
  const vUp = v.toUpperCase();

  // 1. Exact match (case-insensitive)
  for (const item of list) {
    if (item.toUpperCase() === vUp) return item;
  }

  // 2. Contains match
  for (const item of list) {
    const itemUp = item.toUpperCase();
    if (itemUp === vUp) return item;
    // Si el value contiene completamente al item del master (item es una palabra clave)
    if (vUp.includes(itemUp) && itemUp.length >= 4) return item;
    // Si el item del master contiene al value como prefijo (ej "LAVANDINA" -> "LAVANDINA CONCENTRADA")
    if (itemUp.startsWith(vUp) && vUp.length >= 4) return item;
  }

  // 3. Fuzzy por palabras comunes (al menos 1 palabra de 4+ chars)
  const vWords = vUp.split(/[\s,/.()-]+/).filter((w) => w.length >= 4);
  if (vWords.length === 0) return v;
  let bestMatch = "";
  let bestScore = 0;
  for (const item of list) {
    const itemWords = item.toUpperCase().split(/[\s,/.()-]+/).filter((w) => w.length >= 4);
    const common = vWords.filter((w) => itemWords.includes(w)).length;
    // bonus si las primeras palabras son iguales
    const score = common + (vWords[0] === itemWords[0] ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }
  return bestScore >= 1 ? bestMatch : v;
}

async function loadPlazos(): Promise<Map<string, string>> {
  if (plazoCache && plazoCache.expiresAt > Date.now()) return plazoCache.map;
  const map = new Map<string, string>();
  const sheets2026: Record<string, string> = {
    palermo: process.env.SHEET_PALERMO_2026 || "",
    belgrano: process.env.SHEET_BELGRANO_2026 || "",
    madero: process.env.SHEET_MADERO_2026 || "",
  };
  await Promise.all(Object.values(sheets2026).map(async (sid) => {
    if (!sid) return;
    try {
      const rows = await readSheetRaw(sid, "DEUDA AL DIA!A1:L200");
      for (const row of rows.slice(2)) {
        const proveedor = (row[0] || "").toString().trim().toUpperCase();
        const plazoStr = (row[11] || "").toString().trim();
        if (!proveedor || !plazoStr) continue;
        const days = parsePlazo(plazoStr);
        if (days && !map.has(proveedor)) map.set(proveedor, days);
      }
    } catch {
      // ignore
    }
  }));
  plazoCache = { map, expiresAt: Date.now() + PLAZO_TTL };
  return map;
}

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

function toSheetDate(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatArs(n: number): string {
  return "$ " + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Normalizar la label del impuesto que va en las columnas Rubro / INSUMOS.
 * El sheet existente (ver captura) usa labels exactas como:
 *   "IVA 21%", "IVA 10,5%" (con coma), "IVA 1,5%", "PERC. IVA 3%", "IIBB",
 *   "RET. IVA", "IMP. INTERNOS"
 * Si no hay match en la lista de rubros válidos, devuelve la mejor versión
 * normalizada para que Daniela pueda corregir si hace falta.
 */
function normalizeImpuestoLabel(tipo: string, alicuota: number | undefined, validRubros: string[]): string {
  let t = (tipo || "").trim();
  if (!t) return "Impuesto";

  // Normalizaciones comunes
  t = t.replace(/\bpercepci[óo]n\b/gi, "PERC.");
  t = t.replace(/\bingresos brutos\b/gi, "IIBB");
  t = t.replace(/\biibb\b/gi, "IIBB");
  t = t.replace(/\biva\b/gi, "IVA");
  t = t.replace(/\bimp\.?\s*internos?\b/gi, "IMP. INTERNOS");
  t = t.replace(/\bret(\.|encion|ención)\s*iva\b/gi, "RET. IVA");
  // Argentina: convertir alicuotas con punto a coma (10.5% → 10,5%)
  t = t.replace(/(\d+)\.(\d+)\s*%/g, "$1,$2%");
  // Si la alícuota está pero el tipo no la incluye, sumarla
  if (alicuota && alicuota > 0 && !t.includes("%")) {
    const a = String(alicuota).replace(".", ",");
    t = `${t} ${a}%`.trim();
  }
  // Match contra rubros válidos del sheet
  return findBestMatch(t, validRubros);
}

/**
 * Genera las filas a insertar en EGRESOS para una factura.
 *
 * Patrón (tomado de las facturas existentes — ej PESCE 24/4/2026):
 *  - 1 row POR CADA ITEM con su rubro, descripción, cantidad, unidad, precio unit
 *    Ej: PESCE | Pescaderia | TRUCHA   | $347.397 | 26,93 | $12.900
 *        PESCE | Pescaderia | LOMO ATUN | $67.575  | 2,65  | $25.500
 *  - 1 row POR CADA IMPUESTO con rubro = label del impuesto (ej "IVA 21%")
 *    Ej: PESCE | IVA 21%      | IVA 21%      | $87.144 | 1,00 | $87.144
 *        PESCE | PERC. IVA 3% | PERC. IVA 3% | $12.449 | 1,00 | $12.449
 *        PESCE | IIBB         | IIBB         | $12.449 | 1,00 | $12.449
 *
 * Estructura columnas EGRESOS (21 cols A-U según captura del sheet real):
 * A: nro auto · B: Fecha ingreso · C: Fecha FC · D: Fecha Pago
 * E: PROVEEDOR · F: Tipo comprobante · G: Nro comprobante
 * H: Rubro · I: INSUMOS · J: Total de la línea
 * K: cantidad/unidad de medida · L: Precio Un.
 * M: Metodo de Pago · N: Verif. · O: Vto.
 * P: Plazo (días) · Q: MES ingreso · R: MES de pago
 * S: UM · T: INGRESO SUCURSAL · U: precio Un con IVA (formula del sheet)
 */
function buildEgresosRows(
  f: FacturaQueue,
  plazos: Map<string, string>,
  datosss: DatosssLists,
  masterProveedores: MasterProveedor[],
): string[][] {
  // ─── Lookup en DATOS master: matchear SOLO por exact match ───
  // CRITICO: solo exact match (case-insensitive). Antes había fuzzy/contains
  // que producía falsos positivos espectaculares (ej. SLAKE → BORDADOS ZETA).
  // Si no hay match exacto, NO replaceamos el proveedor — usamos lo que vino
  // exacto de la factura/del user.
  const provInput = (f.proveedor || "").toUpperCase().trim();
  const razonInput = (f.razonSocial || "").toUpperCase().trim();
  let masterMatch: MasterProveedor | null = null;
  for (const mp of masterProveedores) {
    const nf = mp.nombreFantasia.toUpperCase().trim();
    const ns = mp.nombreSociedad.toUpperCase().trim();
    // Solo match EXACTO — no contains, no fuzzy
    if (provInput && (nf === provInput || ns === provInput)) {
      masterMatch = mp;
      break;
    }
    if (razonInput && (ns === razonInput || nf === razonInput)) {
      masterMatch = mp;
      break;
    }
  }

  // Proveedor: SIEMPRE lo que vino de la factura. Si hay match exacto en master,
  // los valores son iguales de todas formas. Si no hay match, NO cambiamos nada.
  const proveedorCanonico = f.proveedor || "";
  // Rubro: si la factura no lo trae, usar el del master (solo si exact match)
  const rubroFromMaster = masterMatch ? masterMatch.rubro : "";
  const rubroInput = f.rubro || rubroFromMaster || "";
  // Plazo: si el master lo tiene, preferirlo sobre el plazos viejo
  const plazoMaster = masterMatch ? parsePlazo(masterMatch.plazoPago) : "";

  // Plazo del proveedor (preferir master DATOS, fallback al viejo plazos cache)
  const plazoProv = plazoMaster || plazos.get(proveedorCanonico.toUpperCase()) || plazos.get(provInput) || "";
  // Mes de ingreso y pago en español
  const mesIngreso = mesNombreFromIso(f.fechaIngreso || new Date().toISOString().substring(0, 10));
  const mesPago = mesNombreFromIso(f.fechaPago);

  // Conversión de moneda: si la factura es en USD, multiplicar todos los
  // montos por el tipo de cambio. Cantidad y unidad NO cambian.
  const isUSD = f.moneda === "USD";
  const tc = isUSD && f.tipoCambio > 0 ? f.tipoCambio : 1;
  const convert = (amount: number): number => amount * tc;

  // Match rubro y método de pago contra master del sheet (DATOSSS)
  const rubroMatched = findBestMatch(rubroInput, datosss.rubros);
  const metodoPagoMatched = findBestMatch(f.metodoPago || "Sin pagar", datosss.metodosPago) || (f.metodoPago || "Sin pagar");
  const rows: string[][] = [];
  const fechaIng = toSheetDate(f.fechaIngreso) || toSheetDate(new Date().toISOString().substring(0, 10));
  const fechaFC = toSheetDate(f.fechaFC);
  const fechaPago = toSheetDate(f.fechaPago);
  const fechaVto = toSheetDate(f.fechaVto);
  const metodoPago = metodoPagoMatched;
  const tipo = f.tipoComprobante || "";
  const nro = f.nroComprobante || "";
  const proveedor = proveedorCanonico;

  // Razón social PROPIA (NUESTRA empresa, receptor de la factura: Tobet SRL /
  // Pro Vegan SAS / Icono Sushi SAS — como aparece textual en la factura).
  // CRITICO: usamos EXACTAMENTE lo que el OCR detectó (o lo que el user
  // editó). NO hacemos fallback al mapeo de sucursal porque si hay mismatch
  // (factura de Tobet cargada en Madero por error), queremos que se vea
  // TOBET en el sheet en lugar de ICONO, para detectar el error.
  // Esto se va a escribir en col X = "RAZON SOCIAL PROPIA".
  const razonSocialPropia = (f.razonSocialReceptor || "").trim();

  const validItems = (f.items || []).filter((i) => i.descripcion && (i.subtotal > 0 || i.cantidad > 0));

  // Helper para construir una fila con 21 columnas (A-U).
  // La col X "RAZON SOCIAL PROPIA" se escribe SEPARADO en smartAppend para
  // no pisar la col W (donde Palermo tiene formulas de "Numeracion").
  const makeRow = (
    rubro: string,
    insumo: string,
    total: number,
    cantidadStr: string,
    precioUn: number,
  ): string[] => {
    const precioConIva = precioUn * 1.21; // formula tipica del sheet
    return [
      "",                                 // A
      fechaIng,                           // B Fecha ingreso
      fechaFC,                            // C Fecha FC
      fechaPago,                          // D Fecha Pago
      proveedor,                          // E PROVEEDOR
      tipo,                               // F Tipo comprobante
      nro,                                // G Nro comprobante
      rubro,                              // H Rubro
      insumo,                             // I INSUMOS
      formatArs(total),                   // J Total
      cantidadStr,                        // K unidad de medida (cantidad numerica)
      formatArs(precioUn),                // L Precio Un
      metodoPago,                         // M Metodo de Pago
      "ok",                               // N Verif
      fechaVto,                           // O Vto
      plazoProv,                          // P Plazo (dias del proveedor)
      mesIngreso,                         // Q MES ingreso
      mesPago,                            // R MES de pago
      "$1,00",                            // S UM (constante del sheet)
      "",                                 // T INGRESO SUCURSAL (vacio, fórmula del sheet)
      formatArs(precioConIva),            // U precio Un con IVA
    ];
  };

  // ─── Filas de ITEMS ───
  if (validItems.length > 0) {
    for (const item of validItems) {
      const cantidad = item.cantidad || 1;
      const subtotalLinea = item.subtotal || (cantidad * (item.precioUnitario || 0));
      const precioUn = item.precioUnitario || (cantidad > 0 ? subtotalLinea / cantidad : 0);
      const cantidadStr = cantidad.toLocaleString("es-AR", {
        useGrouping: true,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      // Match descripción contra master de INSUMOS (498 entries)
      const insumoMatched = findBestMatch(item.descripcion, datosss.insumos);
      // Convertir USD->ARS si aplica. Cantidad NO se convierte (sigue siendo unidades).
      rows.push(makeRow(rubroMatched, insumoMatched, convert(subtotalLinea), cantidadStr, convert(precioUn)));
    }
  } else if (f.subtotal > 0) {
    const insumoMatched = findBestMatch(f.insumo || "Varios", datosss.insumos);
    rows.push(makeRow(rubroMatched, insumoMatched, convert(f.subtotal), "1,00", convert(f.subtotal)));
  }

  // ─── Filas de IMPUESTOS ───
  // Rubro = label completa del impuesto matcheada contra valid rubros del sheet.
  // INSUMOS = igual al rubro.
  //
  // Si la factura no tiene impuestos[] detallados pero sí tiene los totales
  // flat (f.iva / f.otrosImpuestos), generamos filas a partir de esos.
  // Detectamos la alicuota más probable:
  //   IVA = total IVA. Si iva ≈ subtotal × 0.21 → IVA 21%. Si ≈ 0.105 → IVA 10,5%.
  let impuestosToWrite = (f.impuestos || []).filter((i) => i.monto && i.monto > 0);
  if (impuestosToWrite.length === 0) {
    if (f.iva && f.iva > 0) {
      const ivaPct = f.subtotal > 0 ? (f.iva / f.subtotal) * 100 : 21;
      let alicuota = 21;
      if (Math.abs(ivaPct - 10.5) < 1) alicuota = 10.5;
      else if (Math.abs(ivaPct - 21) < 1) alicuota = 21;
      else if (Math.abs(ivaPct - 27) < 1) alicuota = 27;
      else if (Math.abs(ivaPct - 1.5) < 0.5) alicuota = 1.5;
      const tipo = `IVA ${String(alicuota).replace(".", ",")}%`;
      impuestosToWrite.push({ tipo, monto: f.iva, alicuota });
    }
    if (f.otrosImpuestos && f.otrosImpuestos > 0) {
      impuestosToWrite.push({ tipo: "Otros Impuestos", monto: f.otrosImpuestos });
    }
  }
  for (const imp of impuestosToWrite) {
    if (!imp.monto || imp.monto === 0) continue;
    const label = normalizeImpuestoLabel(imp.tipo, imp.alicuota, datosss.rubros);
    // Para impuestos: tanto el Rubro como el INSUMO son el label del impuesto
    // (IVA 21%, IIBB, Percep. IVA, etc). Es el formato que ya usaban en el
    // sheet historicamente y el que Daniela pidió.
    rows.push(makeRow(label, label, convert(imp.monto), "1,00", convert(imp.monto)));
  }

  // Edge case: si no hay items NI impuestos, usar total
  if (rows.length === 0) {
    const insumoMatched = findBestMatch(f.insumo || "Varios", datosss.insumos);
    rows.push(makeRow(rubroMatched, insumoMatched, convert(f.total), "1,00", convert(f.total)));
  }

  return rows;
}

async function exportToEgresos(f: FacturaQueue): Promise<{ rowCount: number }> {
  const sheetId = SHEET_IDS[f.year]?.[f.sucursal];
  if (!sheetId) {
    throw new Error(`Sheet no configurado para ${f.sucursal} ${f.year}`);
  }
  // Cargar plazos, datosss del sheet de sucursal + master de DATOS en paralelo
  const [plazos, datosss, masterProveedores] = await Promise.all([
    loadPlazos(),
    loadDatosss(),
    getAllMasterProveedores().catch(() => [] as MasterProveedor[]),
  ]);
  const rows = buildEgresosRows(f, plazos, datosss, masterProveedores);
  if (rows.length === 0) {
    throw new Error("No hay datos para exportar (sin items ni impuestos ni total)");
  }

  // Usamos smartAppend en lugar de appendToSheet con INSERT_ROWS porque el
  // sheet EGRESOS tiene fórmulas/defaults en filas vacías que confunden al
  // auto-detect del API y generan gaps.
  // Pasamos razonSocialReceptor (Tobet S.R.L. / Pro Vegan Food / Icono Sushi)
  // para que smartAppend lo escriba en col X (separada de A:U para no pisar W).
  //
  // Lógica del fallback:
  // 1. Si el OCR detectó algo, usamos eso textual (asi si el OCR ve TOBET pero
  //    la factura se cargo a Madero, en el sheet aparece TOBET y el error es
  //    detectable).
  // 2. Si OCR no detectó nada, usamos el mapeo de sucursal como default
  //    razonable. La columna no debería quedar nunca vacía si la sucursal
  //    está bien seleccionada.
  const SUC_TO_SOCIEDAD_DEFAULT: Record<string, string> = {
    palermo: "Tobet S.R.L.",
    belgrano: "Pro Vegan Food",
    madero: "Icono Sushi",
  };
  const ocrDetected = (f.razonSocialReceptor || "").trim();
  const razonSocialPropia = ocrDetected || SUC_TO_SOCIEDAD_DEFAULT[f.sucursal] || "";
  const updatedRange = await smartAppendToEgresos(sheetId, "EGRESOS", rows, razonSocialPropia);

  // Pintar la PRIMERA fila de la factura en rosa (estilo del sheet existente).
  // Las siguientes filas (más items + impuestos) quedan en blanco.
  if (updatedRange) {
    const parsed = parseA1Range(updatedRange);
    if (parsed) {
      try {
        // Color rosa similar al del sheet (Google Sheets pink-ish: rgb(244, 204, 204))
        await applyBackgroundColor(
          sheetId,
          parsed.tabName,
          parsed.startRow,            // primera fila de las recién añadidas
          parsed.startRow + 1,        // exclusivo, solo 1 fila
          parsed.startCol,
          parsed.endCol,
          { red: 0.957, green: 0.800, blue: 0.800 }, // rgb(244, 204, 204) en floats
        );
      } catch (e) {
        console.warn("[approve] No se pudo aplicar color rosa a fila 1:", e);
      }
    }
  }

  return { rowCount: rows.length };
}

/**
 * POST /api/erp/facturas/approve
 * Body: { id, edits?: Partial<FacturaQueue>, notas?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;
  const user = auth.user;

  if (!userHasPermission(user, "facturas_aprobar") && !userHasPermission(user, "*")) {
    return NextResponse.json({ error: "Sin permiso para aprobar facturas" }, { status: 403 });
  }

  try {
    const body = await request.json() as { id: string; edits?: Partial<FacturaQueue>; notas?: string };
    if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const factura = await getFactura(body.id);
    if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    if (factura.estado === "aprobada") {
      return NextResponse.json({ error: "Factura ya aprobada" }, { status: 400 });
    }

    const merged: FacturaQueue = { ...factura, ...(body.edits || {}) };

    if (!merged.proveedor) return NextResponse.json({ error: "Proveedor requerido" }, { status: 400 });
    if (!merged.total || merged.total <= 0) return NextResponse.json({ error: "Total debe ser > 0" }, { status: 400 });
    if (!merged.sucursal) return NextResponse.json({ error: "Sucursal requerida" }, { status: 400 });
    if (!merged.year) return NextResponse.json({ error: "Año requerido" }, { status: 400 });
    if (merged.moneda === "USD" && (!merged.tipoCambio || merged.tipoCambio <= 0)) {
      return NextResponse.json({ error: "Factura en USD: tipo de cambio requerido (> 0)" }, { status: 400 });
    }

    const exportResult = await exportToEgresos(merged);

    const updated = await updateFactura(body.id, {
      ...body.edits,
      estado: "aprobada",
      reviewedBy: user.email,
      reviewedAt: new Date().toISOString(),
      notasReview: body.notas || "",
    });

    return NextResponse.json({
      ok: true,
      message: `Factura aprobada · ${exportResult.rowCount} fila(s) exportadas a EGRESOS de ${merged.sucursal} ${merged.year}`,
      factura: updated,
    });
  } catch (e) {
    console.error("approve factura error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
