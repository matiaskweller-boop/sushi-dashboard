import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readSheetRaw } from "@/lib/google";

export const runtime = "nodejs";
export const maxDuration = 60;

const SHEET_IDS_2026: Record<string, string> = {
  palermo: process.env.SHEET_PALERMO_2026 || "",
  belgrano: process.env.SHEET_BELGRANO_2026 || "",
  madero: process.env.SHEET_MADERO_2026 || "",
};

let proveedoresCache: { list: string[]; expiresAt: number } | null = null;
const PROVEEDORES_TTL = 10 * 60 * 1000;

/**
 * Cargar lista de proveedores conocidos desde DEUDA AL DIA de las 3 sucursales.
 * Cache 10 min.
 */
async function loadProveedoresMaster(): Promise<string[]> {
  if (proveedoresCache && proveedoresCache.expiresAt > Date.now()) {
    return proveedoresCache.list;
  }
  const set = new Set<string>();
  await Promise.all(
    Object.values(SHEET_IDS_2026).map(async (sheetId) => {
      if (!sheetId) return;
      try {
        const rows = await readSheetRaw(sheetId, "DEUDA AL DIA!A1:H200");
        for (const row of rows.slice(2)) {
          const proveedor = (row[0] || "").toString().trim();
          const razonSocial = (row[6] || "").toString().trim();
          if (proveedor && proveedor.length > 1) set.add(proveedor);
          if (razonSocial && razonSocial.length > 1) set.add(razonSocial);
        }
      } catch (e) {
        console.warn("loadProveedoresMaster:", e);
      }
    })
  );
  const list = Array.from(set).sort();
  proveedoresCache = { list, expiresAt: Date.now() + PROVEEDORES_TTL };
  return list;
}

const SYSTEM_PROMPT_BASE = `Sos un asistente que lee facturas/comprobantes de proveedores de un restaurante en Argentina.
Te paso una foto, imagen escaneada o PDF (puede tener varias páginas).
Si es un PDF con varias páginas, considerá toda la información del documento como una sola factura.
Tenés que extraer los siguientes datos en JSON.

CAMPOS A EXTRAER:
- proveedor: nombre comercial del proveedor (string corto, en mayúsculas)
- razonSocial: razón social completa si aparece (string)
- cuit: CUIT del emisor (string con formato 30-12345678-9 o solo dígitos, vacío si no hay)
- fechaFC: fecha de emisión de la factura en formato YYYY-MM-DD
- fechaVto: fecha de vencimiento del pago si aparece, formato YYYY-MM-DD (vacío si no)
- nroComprobante: número de factura/comprobante completo (ej "0001-00012345")
- tipoComprobante: uno de: "FAC A", "FAC B", "FAC C", "RECIBO", "NOTA DE CREDITO", "REMITO", "TICKET", "OTRO"
- subtotal: subtotal SIN IMPUESTOS (suma de items sin IVA, número, 0 si no hay)
- iva: monto TOTAL del IVA — sumar todas las alícuotas (10.5%, 21%, etc.) si las hay (número)
- otrosImpuestos: suma de IIBB, percepciones IIBB, percepción IVA, impuestos internos, otros (número, 0 si no hay)
- total: TOTAL FINAL de la factura (número, OBLIGATORIO) — debe ser igual a subtotal + iva + otrosImpuestos
- moneda: "ARS" o "USD" (default "ARS")
- rubro: clasifica el contenido en uno de estos rubros del restaurante:
  Almacen, Bebidas c/Alcohol, Bebidas s/Alcohol, Postres y Café, Carniceria,
  Descartables, Productos Orientales, Pescaderia, Polleria, Verduleria, Envios,
  Alquiler, Bazar, Equipamiento, Farmacia, Honorarios Y Abonos, Limpieza,
  Mantenimiento, Servicios, Sueldos, Varios, Acuerdos, IIBB, IMP. INTERNOS, Otros
- insumo: descripción corta de los items principales (string, max 80 chars)
- detalleItems: array de items con:
  - descripcion: string (qué es exactamente, ej "ACEITE DE OLIVA 1L")
  - cantidad: number (puede tener decimales, ej 3.2)
  - unidad: string (UNIDAD DE MEDIDA: "kg", "lt", "g", "ml", "unidad", "m", "cm", "caja", "bolsa", etc.)
  - precioUnitario: number (precio por unidad SIN IVA)
  - subtotal: number (cantidad × precioUnitario, SIN IVA, total de la línea)
  - alicuotaIva: number (10.5 / 21 / 0, según corresponda)
  - montoIva: number (IVA aplicado a esta línea)
  (max 30 items)
- impuestos: array de impuestos del PIE de la factura (NO repetir los items). Cada uno:
  - tipo: string descriptivo (ej "IVA 21%", "IVA 10.5%", "IIBB CABA", "Percep. IVA", "Percep. IIBB", "IMP. INTERNOS", "Otro Impuesto")
  - monto: number (el importe del impuesto)
  - alicuota: number (% si aplica, ej 21, 10.5, 3, 3.5)
  Ejemplos:
  - Si la factura tiene "IVA 21%: $776, Percep. IVA 3%: $111, IIBB 3%: $111", devolvé 3 impuestos.
  - Sumá las alícuotas de IVA por separado si hay más de una (no las consolides).
- confianza: número de 0 a 100 indicando qué tan seguro estás de los datos extraídos
- notas: cualquier observación útil (ej "factura ilegible en zona del CUIT", "letra manuscrita", "tiene 2 alícuotas de IVA")

REGLAS CRITICAS:
- Si un campo no se puede leer con seguridad, devolvé string vacío "" o 0 según el tipo
- Para montos, devolvé NÚMEROS (no strings con $ ni separadores)
- Las fechas argentinas suelen ser DD/MM/YYYY — convertir a YYYY-MM-DD
- Si los items vienen CON IVA en el precio, igualmente extraé precioUnitario SIN IVA (dividir por 1.21 o 1.105)
- Verificá que subtotal + sum(impuestos.monto) ≈ total. Si no cuadra, anotá en notas.
- "iva" debe ser la suma de todos los items con tipo "IVA xx%" del array impuestos
- "otrosImpuestos" debe ser la suma de los impuestos que NO son IVA (IIBB + percepciones + etc.)
- Para items: la unidad de medida es CRITICA. Si dice "3,2 KG" la cantidad es 3.2 y unidad es "kg".
- Si la confianza < 70 explicá en notas qué falta o está borroso
- NO inventes datos. Si no aparece, vacío.

Respondé SOLO con JSON válido, sin markdown, sin texto adicional.`;

function buildPrompt(proveedoresMaster: string[]): string {
  if (proveedoresMaster.length === 0) return SYSTEM_PROMPT_BASE;
  // Limitar a top 100 proveedores para no inflar el prompt
  const list = proveedoresMaster.slice(0, 100).join(", ");
  return SYSTEM_PROMPT_BASE + `\n\nLISTA DE PROVEEDORES CONOCIDOS (matchear si es posible):
${list}

REGLA: si el proveedor de la factura coincide aprox. con uno de la lista (típicamente la razón social del proveedor o el nombre comercial), devolvé EXACTAMENTE el nombre de la lista en el campo "proveedor". Si no matchea, devolvé el nombre tal como aparece en la factura.`;
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
  rubro: string;
  insumo: string;
  detalleItems: Array<{
    descripcion: string;
    cantidad: number;
    unidad: string;
    precioUnitario: number;
    subtotal: number;
    alicuotaIva?: number;
    montoIva?: number;
  }>;
  impuestos: Array<{
    tipo: string;
    monto: number;
    alicuota?: number;
  }>;
  confianza: number;
  notas: string;
}

export async function POST(request: NextRequest) {
  const auth = await requirePermissionApi(request, "facturas");
  if (!auth.ok) return auth.response;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY no configurada" }, { status: 500 });

  try {
    const body = await request.json();
    const { imageBase64, mimeType } = body as { imageBase64: string; mimeType: string };
    if (!imageBase64) return NextResponse.json({ error: "Falta imageBase64" }, { status: 400 });

    const genAI = new GoogleGenerativeAI(apiKey);

    // Cargar lista de proveedores conocidos para que Gemini pueda matchear
    const proveedoresMaster = await loadProveedoresMaster();
    const SYSTEM_PROMPT = buildPrompt(proveedoresMaster);

    // Probar varios modelos en orden hasta que uno responda OK.
    const MODELS_TO_TRY = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ];

    let text: string | null = null;
    let lastErr: Error | null = null;
    let usedModel = "";

    for (const modelName of MODELS_TO_TRY) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const result = await model.generateContent([
          { text: SYSTEM_PROMPT },
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType || "image/jpeg",
            },
          },
        ]);

        text = result.response.text();
        usedModel = modelName;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        console.warn(`[OCR] Modelo ${modelName} fallo:`, lastErr.message.substring(0, 200));
        continue;
      }
    }

    if (!text) {
      const msg = lastErr ? lastErr.message : "Ningun modelo Gemini respondio";
      return NextResponse.json({ error: `Gemini: ${msg}` }, { status: 500 });
    }

    console.log(`[OCR] Usado modelo: ${usedModel}`);
    let parsed: OCRResult;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Intentar extraer JSON de markdown si vino mal formado
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json({ error: "Gemini devolvió respuesta no parseable", raw: text.substring(0, 500) }, { status: 500 });
      }
      parsed = JSON.parse(match[0]);
    }

    // Sanitizar
    const ocrResult: OCRResult = {
      proveedor: String(parsed.proveedor || "").trim(),
      razonSocial: String(parsed.razonSocial || "").trim(),
      cuit: String(parsed.cuit || "").trim(),
      fechaFC: String(parsed.fechaFC || "").trim(),
      fechaVto: String(parsed.fechaVto || "").trim(),
      nroComprobante: String(parsed.nroComprobante || "").trim(),
      tipoComprobante: String(parsed.tipoComprobante || "").trim().toUpperCase(),
      subtotal: Number(parsed.subtotal) || 0,
      iva: Number(parsed.iva) || 0,
      otrosImpuestos: Number(parsed.otrosImpuestos) || 0,
      total: Number(parsed.total) || 0,
      moneda: String(parsed.moneda || "ARS").trim().toUpperCase(),
      rubro: String(parsed.rubro || "").trim(),
      insumo: String(parsed.insumo || "").trim(),
      detalleItems: Array.isArray(parsed.detalleItems) ? parsed.detalleItems.slice(0, 30).map((i) => ({
        descripcion: String(i.descripcion || ""),
        cantidad: Number(i.cantidad) || 0,
        unidad: String(i.unidad || "unidad").trim().toLowerCase(),
        precioUnitario: Number(i.precioUnitario) || 0,
        subtotal: Number(i.subtotal) || 0,
        alicuotaIva: Number(i.alicuotaIva) || 0,
        montoIva: Number(i.montoIva) || 0,
      })) : [],
      impuestos: Array.isArray(parsed.impuestos) ? parsed.impuestos.slice(0, 20).map((i) => ({
        tipo: String(i.tipo || "Otro").trim(),
        monto: Number(i.monto) || 0,
        alicuota: Number(i.alicuota) || 0,
      })).filter((i) => i.monto > 0) : [],
      confianza: Math.max(0, Math.min(100, Number(parsed.confianza) || 0)),
      notas: String(parsed.notas || "").trim(),
    };

    return NextResponse.json({ ok: true, data: ocrResult });
  } catch (e) {
    console.error("OCR error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error procesando imagen" },
      { status: 500 }
    );
  }
}
