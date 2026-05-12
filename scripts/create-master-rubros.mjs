import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));

const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

const ERP_CONFIG = "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";
const TAB = "MASTER RUBROS";

const HEADERS = ["ID", "Rubro", "Categoria", "Activo", "Creado", "CreadoPor"];

// 1. Check if tab exists, create if not
console.log(`Setting up tab "${TAB}" in MASUNORI_ERP_CONFIG...`);
const meta = await sheets.spreadsheets.get({
  spreadsheetId: ERP_CONFIG,
  fields: "sheets(properties(title,sheetId))",
});
let tab = meta.data.sheets.find((s) => s.properties.title === TAB);

if (!tab) {
  console.log(`Creating tab "${TAB}"...`);
  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ERP_CONFIG,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title: TAB,
            gridProperties: { rowCount: 500, columnCount: HEADERS.length, frozenRowCount: 1 },
          },
        },
      }],
    },
  });
  tab = { properties: { title: TAB, sheetId: addRes.data.replies[0].addSheet.properties.sheetId } };
  console.log(`✓ Tab created (sheetId: ${tab.properties.sheetId})`);
} else {
  console.log(`✓ Tab exists (sheetId: ${tab.properties.sheetId})`);
}
const sheetId = tab.properties.sheetId;

// 2. Headers
await sheets.spreadsheets.values.update({
  spreadsheetId: ERP_CONFIG,
  range: `'${TAB}'!A1:F1`,
  valueInputOption: "RAW",
  requestBody: { values: [HEADERS] },
});

await sheets.spreadsheets.batchUpdate({
  spreadsheetId: ERP_CONFIG,
  requestBody: {
    requests: [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.18, green: 0.43, blue: 0.65 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      },
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 3, endColumnIndex: 4 },
          rule: { condition: { type: "BOOLEAN" }, strict: false },
        },
      },
    ],
  },
});
console.log("✓ Headers + checkbox de Activo aplicados");

// 3. Check if already migrated
const existing = await sheets.spreadsheets.values.get({
  spreadsheetId: ERP_CONFIG,
  range: `'${TAB}'!A2:A`,
});
const existingCount = (existing.data.values || []).length;
if (existingCount > 0) {
  console.log(`⚠️  ${existingCount} rubros ya migrados. Saltando migracion.`);
  console.log(`Link: https://docs.google.com/spreadsheets/d/${ERP_CONFIG}/edit#gid=${sheetId}`);
  process.exit(0);
}

// 4. Migrate from MADERO DATOSSS (la "master" del usuario)
const MADERO_ID = process.env.SHEET_MADERO_2026;
console.log(`\nReading rubros from MADERO DATOSSS (col B)...`);
const datossData = await sheets.spreadsheets.values.get({
  spreadsheetId: MADERO_ID,
  range: "DATOSSS!A1:M500",
});
const rows = datossData.data.values || [];

// Mapeo de categorias del P&L (defaults — se pueden editar a mano)
function mapCategoria(rubro) {
  const r = rubro.toLowerCase();
  if (["almacen", "bebidas c/alcohol", "bebidas s/alcohol", "postres", "café", "cafe",
       "carniceria", "carnicería", "descartables", "productos orientales", "pescaderia", "pescadería",
       "polleria", "pollería", "verduleria", "verdulería", "envios", "envíos"].some(k => r.includes(k))) return "Insumos (CMV)";
  if (["sueldos", "rrhh", "aguinaldo", "carga social", "cargas sociales", "liquidacion",
       "despido", "comida personal", "reemplazo", "extra evento", "sindicato", "previsiones"].some(k => r.includes(k))) return "Sueldos / RRHH";
  if (["alquiler", "expensas", "servicios"].some(k => r.includes(k))) return "Alquiler + Servicios";
  if (["bazar", "equipamiento", "farmacia", "honorarios", "inversion",
       "libreria", "librería", "limpieza", "mantenimiento", "redes", "varios"].some(k => r.includes(k))) return "Operativos";
  if (["iva", "iibb", "impuesto", "retencion", "afip", "acuerdo"].some(k => r.includes(k))) return "Impuestos / Acuerdos";
  if (["gasto bancar", "comisi", "interes", "intereses", "financier"].some(k => r.includes(k))) return "Bancarios / Comisiones";
  if (["retiro", "distribucion socios", "dividendos"].some(k => r.includes(k))) return "Retiros (no afecta EBITDA)";
  return "Otros";
}

const seen = new Set();
const migrated = [];
const now = new Date().toISOString();
for (let i = 1; i < rows.length; i++) {
  const rubro = (rows[i][1] || "").toString().trim(); // col B
  if (!rubro || rubro.length < 2) continue;
  const key = rubro.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);
  const id = "RUBRO-" + key.replace(/[^A-Z0-9]+/g, "-").replace(/-+$/g, "").slice(0, 30);
  migrated.push([id, rubro, mapCategoria(rubro), "TRUE", now, "migracion-inicial"]);
}

console.log(`Migrating ${migrated.length} rubros...`);
await sheets.spreadsheets.values.append({
  spreadsheetId: ERP_CONFIG,
  range: `'${TAB}'!A:F`,
  valueInputOption: "RAW",
  insertDataOption: "INSERT_ROWS",
  requestBody: { values: migrated },
});

console.log(`\n✅ DONE`);
console.log(`Rubros migrados: ${migrated.length}`);
console.log(`Link: https://docs.google.com/spreadsheets/d/${ERP_CONFIG}/edit#gid=${sheetId}`);
