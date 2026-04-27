import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));

const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});
const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

const MASUNORI_FOLDER = "12dnPErx1BVARANllU1LESCN3qKrwdKsK";

// Check if already exists
const existing = await drive.files.list({
  q: `'${MASUNORI_FOLDER}' in parents and trashed=false and name='MASUNORI_ERP_CONFIG'`,
  fields: "files(id, name)",
});

let fileId;
if (existing.data.files.length > 0) {
  fileId = existing.data.files[0].id;
  console.log(`Workbook already exists: ${fileId}`);
} else {
  // Create spreadsheet via Drive API directly in the folder (avoids SA quota issue)
  const created = await drive.files.create({
    requestBody: {
      name: "MASUNORI_ERP_CONFIG",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [MASUNORI_FOLDER],
    },
    fields: "id",
  });
  fileId = created.data.id;
  console.log(`Created workbook: ${fileId}`);
}

// Get existing sheets to know what to add
const meta = await sheets.spreadsheets.get({ spreadsheetId: fileId, fields: "sheets(properties(title,sheetId))" });
const existingTabs = new Set(meta.data.sheets.map((s) => s.properties.title));

// Tabs we want
const TABS = ["Usuarios", "Config", "Alertas", "Log", "Facturas_OCR"];
const requests = [];
for (const tab of TABS) {
  if (!existingTabs.has(tab)) {
    requests.push({ addSheet: { properties: { title: tab } } });
  }
}

// Remove default "Sheet1" if it exists
const defaultSheet = meta.data.sheets.find((s) => s.properties.title === "Sheet1" || s.properties.title === "Hoja 1");
if (defaultSheet && TABS.length > 0) {
  // We need to add other sheets first, then delete the default one
  // Do the adds first
  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: fileId,
      requestBody: { requests },
    });
    console.log(`Added ${requests.length} tabs`);
  }
  // Then delete default
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: fileId,
    requestBody: { requests: [{ deleteSheet: { sheetId: defaultSheet.properties.sheetId } }] },
  });
  console.log("Removed default sheet");
} else if (requests.length > 0) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: fileId,
    requestBody: { requests },
  });
  console.log(`Added ${requests.length} tabs`);
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
    spreadsheetId: fileId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
  console.log(`  ✓ Headers added to ${sheetName}`);
}

// Seed Config
await sheets.spreadsheets.values.update({
  spreadsheetId: fileId,
  range: "Config!A2",
  valueInputOption: "RAW",
  requestBody: {
    values: [
      ["MASUNORI_FOLDER_ID", MASUNORI_FOLDER, "ID de la carpeta MASUNORI en Drive"],
      ["VERSION", "1.0.0", "Version del ERP"],
    ],
  },
});

// Seed admin users
await sheets.spreadsheets.values.update({
  spreadsheetId: fileId,
  range: "Usuarios!A2",
  valueInputOption: "RAW",
  requestBody: {
    values: [
      ["matiaskweller@gmail.com", "Matias", "admin", "ALL", "TRUE", new Date().toISOString()],
      ["masunoriadm@gmail.com", "Admin Masunori", "admin", "ALL", "TRUE", new Date().toISOString()],
    ],
  },
});

console.log(`\n✅ Workbook ready: https://docs.google.com/spreadsheets/d/${fileId}`);
console.log(`\nMASUNORI_ERP_CONFIG_ID=${fileId}`);
