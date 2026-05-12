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
const TAB = "MASTER PROVEEDORES";

// Leer header actual para verificar
const headRes = await sheets.spreadsheets.values.get({
  spreadsheetId: ERP_CONFIG,
  range: `'${TAB}'!A1:T1`,
});
const headers = headRes.data.values?.[0] || [];
console.log("Headers actuales:", headers);

// Buscar el sheet ID
const meta = await sheets.spreadsheets.get({
  spreadsheetId: ERP_CONFIG,
  fields: "sheets(properties(title,sheetId))",
});
const sheetId = meta.data.sheets.find((s) => s.properties.title === TAB).properties.sheetId;

if (headers.includes("Centralizado") || headers[17] === "Centralizado") {
  console.log("✓ Columna Centralizado ya existe");
} else {
  console.log("Expandiendo grid a 19 columnas...");
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ERP_CONFIG,
    requestBody: {
      requests: [{
        appendDimension: { sheetId, dimension: "COLUMNS", length: 2 },
      }],
    },
  });

  console.log("Agregando columna Centralizado (col R)...");
  // New schema: ID | Sociedad | Fantasia | Contacto | CUIT | FormaPago | Alias | Titular | Banco | NroCta | Rubro | Plazo | Mail | Corroborado | Notas | ActualizadoEn | ActualizadoPor | Centralizado | NotaCentralizado
  // pero el script original tiene 17 cols (A-Q). Vamos a agregar R = Centralizado, S = NotaCentralizado
  await sheets.spreadsheets.values.update({
    spreadsheetId: ERP_CONFIG,
    range: `'${TAB}'!R1:S1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Centralizado", "NotaCentralizado"]] },
  });

  // Header format
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ERP_CONFIG,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 17, endColumnIndex: 19 },
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
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 1000,
              startColumnIndex: 17, // R
              endColumnIndex: 18,
            },
            rule: { condition: { type: "BOOLEAN" }, strict: false },
          },
        },
      ],
    },
  });
  console.log("✓ Columna agregada con validación de checkbox");
}

console.log("\nDONE");
