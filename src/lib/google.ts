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
 * Devuelve el rango actualizado, ej "EGRESOS!A2451:U2455" o null si no se devolvió.
 */
export async function appendToSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<string | null> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
  return res.data.updates?.updatedRange || null;
}

/**
 * Aplica formato de background color a un rango específico.
 * @param backgroundColor RGB en floats 0-1, ej {red: 0.96, green: 0.80, blue: 0.80}
 */
export async function applyBackgroundColor(
  spreadsheetId: string,
  tabName: string,
  startRowIdx: number, // 0-indexed
  endRowIdx: number,   // exclusive
  startColIdx: number, // 0-indexed
  endColIdx: number,   // exclusive
  backgroundColor: { red: number; green: number; blue: number }
): Promise<void> {
  const sheets = getSheets();
  // Buscar el sheetId numérico de la tab
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title,sheetId))",
  });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === tabName)?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    console.warn(`[applyBackgroundColor] No se encontró sheet con title=${tabName}`);
    return;
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: startRowIdx,
              endRowIndex: endRowIdx,
              startColumnIndex: startColIdx,
              endColumnIndex: endColIdx,
            },
            cell: { userEnteredFormat: { backgroundColor } },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
      ],
    },
  });
}

/**
 * Parsea un rango como "EGRESOS!A2451:U2455" → { startRow: 2451, endRow: 2455, startCol: 0, endCol: 21 }
 * Filas son 1-indexed en el string, las devolvemos 0-indexed.
 */
export function parseA1Range(rangeStr: string): {
  tabName: string;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
} | null {
  const match = rangeStr.match(/^(.+?)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return null;
  const tabName = match[1].replace(/^['"]|['"]$/g, "");
  const colToIdx = (col: string): number => {
    let n = 0;
    for (let i = 0; i < col.length; i++) {
      n = n * 26 + (col.charCodeAt(i) - 64);
    }
    return n - 1; // 0-indexed
  };
  return {
    tabName,
    startRow: parseInt(match[3]) - 1,
    endRow: parseInt(match[5]),
    startCol: colToIdx(match[2]),
    endCol: colToIdx(match[4]) + 1,
  };
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
