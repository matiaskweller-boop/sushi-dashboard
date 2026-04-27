import { google, sheets_v4, drive_v3 } from "googleapis";

let _authClient: ReturnType<typeof google.auth.GoogleAuth.prototype.getClient> extends Promise<infer T> ? T : never | null = null;
let _sheets: sheets_v4.Sheets | null = null;
let _drive: drive_v3.Drive | null = null;

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  // Vercel stores JSON with literal newlines that need escaping
  return JSON.parse(raw.replace(/\n/g, "\\n"));
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

export function getSheets(): sheets_v4.Sheets {
  if (!_sheets) _sheets = google.sheets({ version: "v4", auth: getAuth() });
  return _sheets;
}

export function getDrive(): drive_v3.Drive {
  if (!_drive) _drive = google.drive({ version: "v3", auth: getAuth() });
  return _drive;
}

/**
 * Read a sheet range as array of objects using the first row as headers.
 */
export async function readSheetAsObjects(
  spreadsheetId: string,
  range: string
): Promise<Record<string, string>[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => (h || "").toString().trim());
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] || "").toString();
    });
    return obj;
  });
}

/**
 * Append rows to a sheet (detects next empty row automatically).
 */
export async function appendToSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

/**
 * Read raw rows from a sheet.
 */
export async function readSheetRaw(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values || []) as string[][];
}

/**
 * Parse ARS money string like "$ 669.342,72" to number
 */
export function parseArs(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,\-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Parse a DD/MM/YYYY or D/M/YYYY date string to ISO.
 */
export function parseDate(s: string): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  let year = m[3];
  if (year.length === 2) year = "20" + year;
  return `${year}-${month}-${day}`;
}
