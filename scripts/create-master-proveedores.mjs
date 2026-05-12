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

const sheets = google.sheets({ version: "v4", auth });

// Agregamos la tab al sheet MASUNORI_ERP_CONFIG que ya existe y el SA controla
const ERP_CONFIG = "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";
const TAB = "MASTER PROVEEDORES";

const HEADERS = [
  "ID",                  // A
  "Nombre Sociedad",     // B
  "Nombre Fantasia",     // C
  "Contacto",            // D
  "CUIT",                // E
  "Forma de Pago",       // F
  "Alias o CBU",         // G
  "Titular Cuenta",      // H
  "Banco",               // I
  "Nro Cuenta Bancaria", // J
  "Rubro",               // K
  "Plazo de Pago",       // L
  "Mail",                // M
  "Corroborado",         // N (checkbox)
  "Notas",               // O
  "ActualizadoEn",       // P
  "ActualizadoPor",      // Q
];

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
            gridProperties: { rowCount: 1000, columnCount: HEADERS.length, frozenRowCount: 1, frozenColumnCount: 3 },
          },
        },
      }],
    },
  });
  const newSheetId = addRes.data.replies[0].addSheet.properties.sheetId;
  tab = { properties: { title: TAB, sheetId: newSheetId } };
  console.log(`✓ Tab created (sheetId: ${newSheetId})`);
} else {
  console.log(`✓ Tab "${TAB}" already exists (sheetId: ${tab.properties.sheetId})`);
}

const sheetId = tab.properties.sheetId;

// 2. Write headers
await sheets.spreadsheets.values.update({
  spreadsheetId: ERP_CONFIG,
  range: `'${TAB}'!A1:Q1`,
  valueInputOption: "RAW",
  requestBody: { values: [HEADERS] },
});

// Format header
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
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)",
        },
      },
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            gridProperties: { frozenRowCount: 1, frozenColumnCount: 3 },
          },
          fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        },
      },
    ],
  },
});
console.log(`✓ Headers set + format applied`);

// 3. Check existing rows to avoid duplicate migration
const existing = await sheets.spreadsheets.values.get({
  spreadsheetId: ERP_CONFIG,
  range: `'${TAB}'!A2:A`,
});
const existingCount = (existing.data.values || []).length;

if (existingCount > 0) {
  console.log(`⚠️  ${existingCount} rows already exist. Skipping migration.`);
  console.log("Clear rows 2+ manually if you want to re-migrate.");
  console.log(`\n✅ DONE`);
  console.log(`SHEET_MASTER_PROVEEDORES=${ERP_CONFIG}`);
  console.log(`TAB="${TAB}"`);
  process.exit(0);
}

// 4. Read MADERO DEUDA AL DIA
console.log("\n=== Migrating from MADERO DEUDA AL DIA ===");
const MADERO_ID = process.env.SHEET_MADERO_2026;
const deudaData = await sheets.spreadsheets.values.get({
  spreadsheetId: MADERO_ID,
  range: "'DEUDA AL DIA'!A1:N1000",
});
const dRows = deudaData.data.values || [];

let headerIdx = -1;
for (let i = 0; i < Math.min(5, dRows.length); i++) {
  const row = dRows[i].map((c) => (c || "").toString().toUpperCase().trim());
  if (row.some((c) => c === "PROVEEDOR")) { headerIdx = i; break; }
}
if (headerIdx === -1) {
  console.log("! No header found");
  process.exit(1);
}

const dheaders = dRows[headerIdx].map((c) => (c || "").toString().trim().toUpperCase());
const findCol = (...names) => {
  for (const n of names) {
    const idx = dheaders.findIndex((h) => h.includes(n.toUpperCase()));
    if (idx !== -1) return idx;
  }
  return -1;
};

const colProv = findCol("PROVEEDOR");
const colAlias = findCol("ALIAS");
const colRazon = findCol("NOMBRE O R SOCIAL", "RAZON SOCIAL");
const colBanco = findCol("BANCO");
const colCbu = findCol("CBU");
const colAgendado = findCol("AGENDADO");
const colProducto = findCol("PRODUCTO");
const colPlazo = findCol("PLAZOS DE PAGO", "PLAZO");
const colAclaracion = findCol("ACLARACION");
const colNotas = findCol("NOTAS", "OBSERVAC");

const seen = new Set();
const migrated = [];
const now = new Date().toISOString();

for (let i = headerIdx + 1; i < dRows.length; i++) {
  const row = dRows[i];
  if (!row || row.length === 0) continue;
  const nombreFantasia = (row[colProv] || "").trim();
  if (!nombreFantasia || nombreFantasia.length < 2) continue;
  const key = nombreFantasia.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  const id = "PROV-" + key.replace(/[^A-Z0-9]+/g, "-").replace(/-+$/g, "").slice(0, 40);
  const aclaracion = colAclaracion >= 0 ? (row[colAclaracion] || "").trim() : "";
  const notasOrig = colNotas >= 0 ? (row[colNotas] || "").trim() : "";
  const notas = [aclaracion, notasOrig].filter(Boolean).join(" | ");

  migrated.push([
    id,                                                       // A
    colRazon >= 0 ? (row[colRazon] || "").trim() : "",        // B Nombre Sociedad
    nombreFantasia,                                            // C Nombre Fantasia
    "",                                                        // D Contacto
    "",                                                        // E CUIT
    "",                                                        // F Forma de Pago
    colAlias >= 0 ? (row[colAlias] || "").trim() : "",        // G Alias o CBU
    colAgendado >= 0 ? (row[colAgendado] || "").trim() : "",  // H Titular
    colBanco >= 0 ? (row[colBanco] || "").trim() : "",        // I Banco
    colCbu >= 0 ? (row[colCbu] || "").trim() : "",            // J Nro Cuenta
    colProducto >= 0 ? (row[colProducto] || "").trim() : "",  // K Rubro
    colPlazo >= 0 ? (row[colPlazo] || "").trim() : "",        // L Plazo
    "",                                                        // M Mail
    "FALSE",                                                   // N Corroborado
    notas,                                                     // O Notas
    now,                                                       // P Actualizado
    "migración-inicial",                                       // Q ActualizadoPor
  ]);
}

console.log(`Found ${migrated.length} unique proveedores to migrate`);

// Append
await sheets.spreadsheets.values.append({
  spreadsheetId: ERP_CONFIG,
  range: `'${TAB}'!A:Q`,
  valueInputOption: "RAW",
  insertDataOption: "INSERT_ROWS",
  requestBody: { values: migrated },
});
console.log(`  ✓ Migrated ${migrated.length} proveedores`);

// 5. Add checkbox validation for Corroborado column
console.log("\nAdding checkbox validation for column N (Corroborado)...");
await sheets.spreadsheets.batchUpdate({
  spreadsheetId: ERP_CONFIG,
  requestBody: {
    requests: [{
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 1000,
          startColumnIndex: 13,
          endColumnIndex: 14,
        },
        rule: {
          condition: { type: "BOOLEAN" },
          strict: false,
        },
      },
    }],
  },
});

console.log("\n✅ DONE");
console.log(`Master Proveedores tab created in MASUNORI_ERP_CONFIG`);
console.log(`Sheet ID: ${ERP_CONFIG}`);
console.log(`Tab: "${TAB}"`);
console.log(`Link: https://docs.google.com/spreadsheets/d/${ERP_CONFIG}/edit#gid=${sheetId}`);
