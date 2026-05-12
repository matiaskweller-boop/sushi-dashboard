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
const TAB = "Facturas";

const meta = await sheets.spreadsheets.get({
  spreadsheetId: ERP_CONFIG,
  fields: "sheets(properties(title,sheetId,gridProperties))",
});
const tab = meta.data.sheets.find((s) => s.properties.title === TAB);
if (!tab) { console.log("Tab Facturas no existe"); process.exit(1); }

const currentCols = tab.properties.gridProperties.columnCount;
console.log(`Tab "${TAB}" actualmente tiene ${currentCols} columnas`);

if (currentCols < 33) {
  console.log(`Expandiendo a 33 columnas (agregando ${33 - currentCols})...`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ERP_CONFIG,
    requestBody: {
      requests: [{
        appendDimension: {
          sheetId: tab.properties.sheetId,
          dimension: "COLUMNS",
          length: 33 - currentCols,
        },
      }],
    },
  });
  console.log("✓ Grid expandido");
} else {
  console.log("✓ Grid ya tiene 33+ columnas");
}

// Set header AG1
await sheets.spreadsheets.values.update({
  spreadsheetId: ERP_CONFIG,
  range: `${TAB}!AG1`,
  valueInputOption: "RAW",
  requestBody: { values: [["RazonSocialReceptor"]] },
});
console.log(`✓ Header AG1 = "RazonSocialReceptor" seteado`);

console.log("\nDONE");
