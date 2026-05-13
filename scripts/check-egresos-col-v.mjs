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

const sucursales = {
  Palermo: process.env.SHEET_PALERMO_2026,
  Belgrano: process.env.SHEET_BELGRANO_2026,
  Madero: process.env.SHEET_MADERO_2026,
};

for (const [name, id] of Object.entries(sucursales)) {
  console.log(`\n=== ${name} (${id}) ===`);
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: id,
      fields: "sheets(properties(title,sheetId,gridProperties))",
    });
    const egresos = meta.data.sheets.find((s) => s.properties.title === "EGRESOS");
    if (!egresos) { console.log("! No EGRESOS tab"); continue; }
    console.log(`Grid: ${egresos.properties.gridProperties.rowCount} rows × ${egresos.properties.gridProperties.columnCount} cols`);

    // Read header row + first 5 data rows for cols U-Z
    const data = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: "EGRESOS!U1:Z5",
    });
    const rows = data.data.values || [];
    console.log(`Cols U-Z (rows 1-5):`);
    rows.forEach((row, i) => {
      const filled = row.map((c, ci) => c ? `${String.fromCharCode(85 + ci)}=${String(c).substring(0,40)}` : "").filter(Boolean);
      console.log(`  row ${i+1}: ${filled.join(" | ") || "(empty)"}`);
    });

    // Count cells with data in V across all rows
    const colV = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: "EGRESOS!V:V",
    });
    const vRows = colV.data.values || [];
    const vFilled = vRows.filter(r => r[0] && String(r[0]).trim()).length;
    console.log(`Col V tiene ${vFilled} filas con dato`);
  } catch (e) {
    console.log(`! ${e.message}`);
  }
}
