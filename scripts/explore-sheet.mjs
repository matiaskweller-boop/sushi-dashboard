import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config({ path: "/Users/matiaskw/Desktop/masunori-dashboard/.env.prod.gcp" });

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const saJson = JSON.parse(raw.replace(/\n/g, "\\n"));

const auth = new google.auth.GoogleAuth({
  credentials: saJson,
  scopes: [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ],
});
const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

const ROOT_ID = "12dnPErx1BVARANllU1LESCN3qKrwdKsK";

// Get all spreadsheets in MASUNORI folder
const folder = await drive.files.list({
  q: `'${ROOT_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'`,
  fields: "files(id, name)",
  orderBy: "name",
});

for (const file of folder.data.files) {
  console.log(`\n══════════════════════════════════`);
  console.log(`📊 ${file.name}`);
  console.log(`══════════════════════════════════`);

  try {
    // Get sheet metadata (tabs/sheets inside the workbook)
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: file.id,
      fields: "sheets(properties(title,gridProperties(rowCount,columnCount)))",
    });

    for (const sheet of meta.data.sheets) {
      const { title, gridProperties } = sheet.properties;
      console.log(`\n  📄 Tab: "${title}" (${gridProperties.rowCount} filas x ${gridProperties.columnCount} cols)`);

      // Read first 3 rows to get headers/sample data
      try {
        const data = await sheets.spreadsheets.values.get({
          spreadsheetId: file.id,
          range: `${title}!A1:Z5`,
        });
        const rows = data.data.values || [];
        rows.forEach((row, i) => {
          const preview = row.slice(0, 10).map(c => (c || "").toString().substring(0, 20)).join(" | ");
          console.log(`     [${i}] ${preview}`);
        });
      } catch (e) {
        console.log(`     ⚠️  Can't read: ${e.message.substring(0, 80)}`);
      }
    }
  } catch (e) {
    console.log(`  ⚠️  Error: ${e.message.substring(0, 100)}`);
  }
}
