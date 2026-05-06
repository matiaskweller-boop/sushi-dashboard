import { NextRequest, NextResponse } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";
import { getSheets, readSheetRaw } from "@/lib/google";

export const runtime = "nodejs";

const ERP_CONFIG_SHEET = process.env.ERP_CONFIG_SHEET_ID || "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";
const TAB = "RubroCategorias";

const VALID_CATEGORIAS = [
  "insumos", "sueldos", "alquilerServicios", "operativos",
  "financieros", "impuestos", "retiros", "otros",
];

/**
 * Asegurar que existe la tab RubroCategorias en el config workbook.
 * Si no existe, crearla con headers.
 */
async function ensureTab() {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: ERP_CONFIG_SHEET,
    fields: "sheets(properties(title))",
  });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === TAB);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ERP_CONFIG_SHEET,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
  });

  // Set headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: ERP_CONFIG_SHEET,
    range: `${TAB}!A1:D1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Rubro", "Categoria", "ActualizadoPor", "ActualizadoEn"]] },
  });
}

/**
 * Leer todos los overrides como Record<rubro, categoria>.
 */
async function readOverrides(): Promise<Record<string, string>> {
  try {
    const rows = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:D1000`);
    const result: Record<string, string> = {};
    for (const row of rows) {
      const rubro = (row[0] || "").toString().trim();
      const categoria = (row[1] || "").toString().trim().toLowerCase();
      if (rubro && categoria) result[rubro] = categoria;
    }
    return result;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: "Sesion expirada" }, { status: 401 });

  try {
    await ensureTab();
    const overrides = await readOverrides();
    return NextResponse.json({ overrides });
  } catch (e) {
    console.error("rubro-categorias GET error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: "Sesion expirada" }, { status: 401 });

  try {
    const body = await request.json() as { rubro: string; categoria: string };
    const rubro = String(body.rubro || "").trim();
    const categoria = String(body.categoria || "").trim().toLowerCase();

    if (!rubro) return NextResponse.json({ error: "Falta rubro" }, { status: 400 });
    if (!VALID_CATEGORIAS.includes(categoria)) {
      return NextResponse.json({ error: `Categoría inválida. Válidas: ${VALID_CATEGORIAS.join(", ")}` }, { status: 400 });
    }

    await ensureTab();

    // Upsert: buscar fila con ese rubro y reemplazar, o agregar nueva
    const sheets = getSheets();
    const existing = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:D1000`);
    const idx = existing.findIndex((r) => (r[0] || "").toString().trim() === rubro);
    const rowData = [rubro, categoria, session.email, new Date().toISOString()];

    if (idx >= 0) {
      // Update existing row (sheet row = idx + 2 because of header)
      const sheetRow = idx + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: ERP_CONFIG_SHEET,
        range: `${TAB}!A${sheetRow}:D${sheetRow}`,
        valueInputOption: "RAW",
        requestBody: { values: [rowData] },
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: ERP_CONFIG_SHEET,
        range: `${TAB}!A:D`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [rowData] },
      });
    }

    const overrides = await readOverrides();
    return NextResponse.json({ ok: true, overrides });
  } catch (e) {
    console.error("rubro-categorias POST error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * DELETE one override (revert to default classification).
 */
export async function DELETE(request: NextRequest) {
  const token = getSessionFromRequest(request);
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: "Sesion expirada" }, { status: 401 });

  try {
    const url = new URL(request.url);
    const rubro = url.searchParams.get("rubro");
    if (!rubro) return NextResponse.json({ error: "Falta rubro" }, { status: 400 });

    await ensureTab();
    const sheets = getSheets();
    const existing = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:D1000`);
    const idx = existing.findIndex((r) => (r[0] || "").toString().trim() === rubro);
    if (idx < 0) return NextResponse.json({ ok: true, overrides: await readOverrides() });

    const sheetRow = idx + 2;
    // Get sheetId for the tab
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: ERP_CONFIG_SHEET,
      fields: "sheets(properties(title,sheetId))",
    });
    const sheetId = meta.data.sheets?.find((s) => s.properties?.title === TAB)?.properties?.sheetId;
    if (sheetId === undefined) return NextResponse.json({ error: "Tab no encontrada" }, { status: 500 });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ERP_CONFIG_SHEET,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: sheetRow - 1, endIndex: sheetRow },
          },
        }],
      },
    });

    const overrides = await readOverrides();
    return NextResponse.json({ ok: true, overrides });
  } catch (e) {
    console.error("rubro-categorias DELETE error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
