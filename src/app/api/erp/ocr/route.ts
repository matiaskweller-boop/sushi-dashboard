import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/lib/admin-permissions";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Sos un asistente que lee facturas/comprobantes de proveedores de un restaurante en Argentina.
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
  - descripcion: string (qué es)
  - cantidad: number (unidades)
  - precioUnitario: number (precio por unidad SIN IVA)
  - subtotal: number (cantidad × precioUnitario, SIN IVA, total de la línea)
  - alicuotaIva: number (10.5 / 21 / 0, según corresponda)
  - montoIva: number (IVA aplicado a esta línea)
  (max 30 items)
- confianza: número de 0 a 100 indicando qué tan seguro estás de los datos extraídos
- notas: cualquier observación útil (ej "factura ilegible en zona del CUIT", "letra manuscrita", "tiene 2 alícuotas de IVA")

REGLAS CRITICAS:
- Si un campo no se puede leer con seguridad, devolvé string vacío "" o 0 según el tipo
- Para montos, devolvé NÚMEROS (no strings con $ ni separadores)
- Las fechas argentinas suelen ser DD/MM/YYYY — convertir a YYYY-MM-DD
- Si los items vienen CON IVA en el precio, igualmente extraé precioUnitario SIN IVA (dividir por 1.21 o 1.105)
- Verificá que subtotal + iva + otrosImpuestos = total. Si no cuadra, anotá en notas.
- Si la confianza < 70 explicá en notas qué falta o está borroso
- NO inventes datos. Si no aparece, vacío.

Respondé SOLO con JSON válido, sin markdown, sin texto adicional.`;

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
    precioUnitario: number;
    subtotal: number;
    alicuotaIva?: number;
    montoIva?: number;
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

    // Probar varios modelos en orden hasta que uno responda OK.
    // Gemini cambia los modelos disponibles cada tanto, asi que con
    // fallback nos cubrimos.
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
        precioUnitario: Number(i.precioUnitario) || 0,
        subtotal: Number(i.subtotal) || 0,
        alicuotaIva: Number(i.alicuotaIva) || 0,
        montoIva: Number(i.montoIva) || 0,
      })) : [],
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
