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

const FILE_ID = "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";
const MASUNORI_FOLDER = "12dnPErx1BVARANllU1LESCN3qKrwdKsK";

// Get existing sheets
const meta = await sheets.spreadsheets.get({ spreadsheetId: FILE_ID, fields: "sheets(properties(title,sheetId))" });
const existingTabs = new Map(meta.data.sheets.map((s) => [s.properties.title, s.properties.sheetId]));

console.log("Existing tabs:", [...existingTabs.keys()].join(", "));

const TABS = ["Usuarios", "Config", "Alertas", "Log", "Facturas_OCR"];
const addRequests = [];
for (const tab of TABS) {
  if (!existingTabs.has(tab)) addRequests.push({ addSheet: { properties: { title: tab } } });
}

if (addRequests.length > 0) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: FILE_ID,
    requestBody: { requests: addRequests },
  });
  console.log(`✓ Added ${addRequests.length} tabs`);
}

// Delete default "Hoja 1" or "Sheet1" if they exist and we now have our tabs
const newMeta = await sheets.spreadsheets.get({ spreadsheetId: FILE_ID, fields: "sheets(properties(title,sheetId))" });
const defaultSheet = newMeta.data.sheets.find((s) =>
  ["Hoja 1", "Sheet1", "Hoja1"].includes(s.properties.title)
);
if (defaultSheet && newMeta.data.sheets.length > TABS.length) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: FILE_ID,
    requestBody: { requests: [{ deleteSheet: { sheetId: defaultSheet.properties.sheetId } }] },
  });
  console.log(`✓ Removed default sheet: "${defaultSheet.properties.title}"`);
}

// Set headers
const headers = {
  Usuarios: [["Email", "Nombre", "Rol", "Sucursales", "Activo", "Creado"]],
  Config: [["Clave", "Valor", "Descripcion"]],
  Alertas: [["Fecha", "Tipo", "Sucursal", "Mensaje", "Prioridad", "Atendida"]],
  Log: [["Timestamp", "Usuario", "Accion", "Detalle"]],
  Facturas_OCR: [[
    "Timestamp", "Usuario", "Sucursal", "Proveedor", "TipoComprobante",
    "NroComprobante", "FechaFC", "Rubro", "Insumo", "Monto",
    "CBU/Cuenta", "FotoURL", "Confianza", "Estado", "NotasOCR",
  ]],
};

for (const [sheetName, rows] of Object.entries(headers)) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: FILE_ID,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
  console.log(`  ✓ Headers set in ${sheetName}`);
}

// Format headers as bold with background color
const formatRequests = [];
for (const sheetName of TABS) {
  const sheetId = newMeta.data.sheets.find((s) => s.properties.title === sheetName)?.properties.sheetId;
  if (sheetId === undefined) continue;
  formatRequests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.18, green: 0.43, blue: 0.64 },
          textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
          horizontalAlignment: "CENTER",
        },
      },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
    },
  });
  formatRequests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount",
    },
  });
}
if (formatRequests.length > 0) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: FILE_ID,
    requestBody: { requests: formatRequests },
  });
  console.log("✓ Headers formatted");
}

// Seed Config
await sheets.spreadsheets.values.update({
  spreadsheetId: FILE_ID,
  range: "Config!A2",
  valueInputOption: "RAW",
  requestBody: {
    values: [
      ["MASUNORI_FOLDER_ID", MASUNORI_FOLDER, "ID de la carpeta MASUNORI en Drive"],
      ["VERSION", "1.0.0", "Version del ERP"],
      ["AÑO_ACTUAL", "2026", "Año actual de datos"],
    ],
  },
});
console.log("  ✓ Config seeded");

// Seed admin users
await sheets.spreadsheets.values.update({
  spreadsheetId: FILE_ID,
  range: "Usuarios!A2",
  valueInputOption: "RAW",
  requestBody: {
    values: [
      ["matiaskweller@gmail.com", "Matias", "admin", "ALL", "TRUE", new Date().toISOString()],
      ["masunoriadm@gmail.com", "Admin Masunori", "admin", "ALL", "TRUE", new Date().toISOString()],
    ],
  },
});
console.log("  ✓ Admin users seeded");

console.log(`\n✅ Workbook configured: https://docs.google.com/spreadsheets/d/${FILE_ID}`);
