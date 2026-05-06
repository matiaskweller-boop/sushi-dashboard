import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, getSessionFromRequest, SessionPayload, COOKIE_NAME } from "@/lib/auth";
import { readSheetRaw, getSheets } from "@/lib/google";

export const OWNER_EMAIL = "matiaskweller@gmail.com";

export const ALL_PERMISSIONS = [
  "ventas",        // Dashboard, KPIs, Histórico (la barra "Ventas")
  "pnl",
  "egresos",
  "proveedores",
  "caja",
  "descuentos",
  "alertas",
  "facturas",
  "consumo",
  "stock",
  "menu",
  "competencia",
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

export interface UserAccess {
  email: string;
  name: string;
  active: boolean;
  perms: string[]; // ["*"] o lista de permisos
  isOwner: boolean;
  createdAt: string;
}

const ERP_CONFIG_SHEET = process.env.ERP_CONFIG_SHEET_ID || "1YMIE_t1O5RBfXGwFQf7xzh-TeuPUV6SfIl4Smj2mk1g";
const TAB = "Usuarios";

// In-memory cache (30 segundos) — se reinicia con cada deploy
// 30s para que cambios de permisos en la UI tarden poco en propagar.
const cache = new Map<string, { user: UserAccess | null; expiresAt: number }>();
const CACHE_TTL = 30 * 1000;

/**
 * Asegurar que la tab Usuarios existe con headers v2 (incluye Permisos).
 * Si existe con headers viejos, los reemplaza para llevar a v2.
 * Schema v2: Email | Nombre | Rol | Sucursales | Permisos | Activo | Creado
 */
async function ensureUsuariosTab() {
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: ERP_CONFIG_SHEET,
    fields: "sheets(properties(title))",
  });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ERP_CONFIG_SHEET,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: ERP_CONFIG_SHEET,
      range: `${TAB}!A1:G1`,
      valueInputOption: "RAW",
      requestBody: { values: [["Email", "Nombre", "Rol", "Sucursales", "Permisos", "Activo", "Creado"]] },
    });
  }
}

interface SchemaCols {
  email: number;
  nombre: number;
  rol: number;
  sucursales: number;
  permisos: number; // -1 si no existe en headers viejos
  activo: number;
  creado: number;
}

/**
 * Lee headers de la tab Usuarios y devuelve indices por nombre.
 * Tolera schema viejo (sin Permisos) y schema nuevo.
 */
async function readSchema(): Promise<SchemaCols> {
  const headerRows = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A1:Z1`);
  const headers = (headerRows[0] || []).map((h) => (h || "").toString().trim().toLowerCase());
  const find = (...names: string[]): number => {
    for (const n of names) {
      const i = headers.findIndex((h) => h === n.toLowerCase());
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    email: find("email", "mail"),
    nombre: find("nombre", "name"),
    rol: find("rol", "role"),
    sucursales: find("sucursales", "branches"),
    permisos: find("permisos", "permissions", "perms"),
    activo: find("activo", "active"),
    creado: find("creado", "created", "createdat"),
  };
}

/**
 * Lee TODOS los usuarios de la tab Usuarios.
 * Owner siempre tiene acceso a todo, exista o no en la tab.
 * Tolera schema viejo (sin columna Permisos): si rol=admin asume *.
 */
export async function getAllUsers(): Promise<UserAccess[]> {
  try {
    await ensureUsuariosTab();
    let schema = await readSchema();
    // Auto-migrar si tiene schema viejo (sin Permisos)
    if (schema.permisos < 0 && schema.email >= 0) {
      schema = await migrateSchemaIfNeeded();
    }
    if (schema.email < 0) return [];
    const rows = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:Z1000`);
    const users: UserAccess[] = [];
    for (const row of rows) {
      const email = (row[schema.email] || "").toString().trim().toLowerCase();
      if (!email) continue;
      const rol = schema.rol >= 0 ? (row[schema.rol] || "").toString().toLowerCase().trim() : "";
      const permsStr = schema.permisos >= 0 ? (row[schema.permisos] || "").toString().trim() : "";
      const activeStr = schema.activo >= 0 ? (row[schema.activo] || "").toString().toLowerCase().trim() : "true";
      const createdAt = schema.creado >= 0 ? (row[schema.creado] || "").toString() : "";

      let perms: string[];
      if (permsStr === "*" || rol === "admin") {
        perms = ["*"];
      } else if (permsStr) {
        perms = permsStr.split(",").map((p) => p.trim()).filter(Boolean);
      } else {
        // Sin permisos explícitos y no admin: sin acceso
        perms = [];
      }

      users.push({
        email,
        name: ((schema.nombre >= 0 ? row[schema.nombre] : "") || "").toString().trim(),
        active: activeStr === "true" || activeStr === "1" || activeStr === "si" || activeStr === "sí",
        perms,
        isOwner: email === OWNER_EMAIL,
        createdAt,
      });
    }

    // Garantizar que el OWNER siempre está en la lista
    if (!users.some((u) => u.email === OWNER_EMAIL)) {
      users.unshift({
        email: OWNER_EMAIL,
        name: "Matias (owner)",
        active: true,
        perms: ["*"],
        isOwner: true,
        createdAt: "",
      });
    }

    // Mergear con ALLOWED_EMAILS — emails que pueden loguearse pero no tienen
    // perms asignados aún. Aparecen en la UI con perms=[] para que el owner
    // pueda configurarlos.
    const allowedRaw = (process.env.ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    for (const allowedEmail of allowedRaw) {
      if (users.some((u) => u.email === allowedEmail)) continue;
      users.push({
        email: allowedEmail,
        name: "(sin nombre, agregar)",
        active: true,
        perms: [],
        isOwner: false,
        createdAt: "",
      });
    }

    return users;
  } catch (e) {
    console.error("getAllUsers error:", e);
    return [];
  }
}

/**
 * Obtener UserAccess de un email específico (con cache).
 */
export async function getUserAccess(email: string): Promise<UserAccess | null> {
  if (!email) return null;
  const lower = email.toLowerCase();

  // Owner SIEMPRE tiene acceso a todo
  if (lower === OWNER_EMAIL) {
    return {
      email: lower,
      name: "Matias",
      active: true,
      perms: ["*"],
      isOwner: true,
      createdAt: "",
    };
  }

  const cached = cache.get(lower);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const users = await getAllUsers();
  const user = users.find((u) => u.email === lower) || null;
  cache.set(lower, { user, expiresAt: Date.now() + CACHE_TTL });
  return user;
}

/**
 * Invalidar cache (al actualizar un usuario).
 */
export function invalidateUserCache(email?: string) {
  if (email) cache.delete(email.toLowerCase());
  else cache.clear();
}

/**
 * Chequear si un user tiene un permiso específico.
 * - "_users": solo owner
 * - "logged_in": cualquier user activo (sirve para landing /administracion)
 * - "any": al menos un permiso explícito
 * - "*": acceso total
 * - cualquier otro string: ese permiso específico
 */
export function userHasPermission(user: UserAccess | null, permission: string | "any" | "_users" | "logged_in"): boolean {
  if (!user || !user.active) return false;
  if (user.isOwner) return true;
  if (permission === "_users") return user.isOwner;
  if (permission === "logged_in") return true; // cualquier user activo
  if (user.perms.includes("*")) return true;
  if (permission === "any") return user.perms.length > 0;
  return user.perms.includes(permission);
}

/**
 * Server-side: requiere session activa + permiso. Si no, redirige.
 * Para usar en server components / layouts.
 *
 * Si la falla es por falta de permiso específico, redirige a /administracion
 * (landing accesible para cualquier user logueado activo).
 * Si el user no existe o está inactivo, redirige a /login.
 */
export async function requirePermission(permission: string | "any" | "_users" | "logged_in"): Promise<UserAccess> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect("/login");
  const session: SessionPayload | null = await verifySession(token);
  if (!session) redirect("/login");

  const user = await getUserAccess(session.email);
  if (!user || !user.active) redirect("/login?error=inactive");
  if (!userHasPermission(user, permission)) {
    if (permission === "_users") redirect("/administracion?error=owner_only");
    redirect("/administracion?error=perm_denied&need=" + encodeURIComponent(String(permission)));
  }
  return user;
}

/**
 * API-side: verifica permiso y devuelve UserAccess o lanza una respuesta 401/403.
 */
export async function requirePermissionApi(
  request: NextRequest,
  permission: string | "any" | "_users"
): Promise<{ ok: true; user: UserAccess } | { ok: false; response: NextResponse }> {
  const token = getSessionFromRequest(request);
  if (!token) return { ok: false, response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const session = await verifySession(token);
  if (!session) return { ok: false, response: NextResponse.json({ error: "Sesión expirada" }, { status: 401 }) };

  const user = await getUserAccess(session.email);
  if (!user || !user.active) {
    return { ok: false, response: NextResponse.json({ error: "Usuario inactivo o sin permisos" }, { status: 403 }) };
  }
  if (!userHasPermission(user, permission)) {
    return { ok: false, response: NextResponse.json({ error: `Sin permiso: ${permission}` }, { status: 403 }) };
  }
  return { ok: true, user };
}

/**
 * Migrar headers de schema viejo (sin Permisos) a schema nuevo.
 * Si la tab tenía Activo en col E (sin Permisos), reescribe headers como Email|Nombre|Rol|Sucursales|Permisos|Activo|Creado
 * y mueve el contenido de Activo (col E) a la nueva ubicación (col F), pegando "*" en la nueva col E si rol=admin.
 */
async function migrateSchemaIfNeeded(): Promise<SchemaCols> {
  const schema = await readSchema();
  if (schema.permisos >= 0) return schema; // ya está migrado

  // Backup data viejo
  const sheets = getSheets();
  const headerRows = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A1:Z1`);
  const headersOld = (headerRows[0] || []).map((h) => (h || "").toString().trim());
  // Schema viejo: Email | Nombre | Rol | Sucursales | Activo | Creado
  // Schema nuevo: Email | Nombre | Rol | Sucursales | Permisos | Activo | Creado

  const dataRows = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:Z1000`);
  const newRows: string[][] = dataRows.map((row) => {
    const email = (row[0] || "").toString();
    const name = (row[1] || "").toString();
    const rol = (row[2] || "").toString();
    const sucursales = (row[3] || "").toString();
    const oldActivo = (row[4] || "").toString();
    const oldCreado = (row[5] || "").toString();
    const perms = rol.toLowerCase() === "admin" ? "*" : "";
    return [email, name, rol, sucursales, perms, oldActivo, oldCreado];
  });

  // Reescribir todo (headers + data)
  const allRows = [["Email", "Nombre", "Rol", "Sucursales", "Permisos", "Activo", "Creado"], ...newRows];
  await sheets.spreadsheets.values.update({
    spreadsheetId: ERP_CONFIG_SHEET,
    range: `${TAB}!A1:G${allRows.length}`,
    valueInputOption: "RAW",
    requestBody: { values: allRows },
  });

  console.log(`[admin-permissions] Migrated ${dataRows.length} rows from old schema to new schema (added Permisos column).`);
  console.log(`[admin-permissions] Old headers: ${headersOld.join(" | ")}`);
  return await readSchema();
}

/**
 * Upsert un usuario (solo el owner debe poder llamar esto).
 */
export async function upsertUser(input: {
  email: string;
  name: string;
  perms: string[]; // o ["*"]
  active: boolean;
}): Promise<void> {
  await ensureUsuariosTab();
  await migrateSchemaIfNeeded();
  const sheets = getSheets();
  const lowerEmail = input.email.toLowerCase().trim();
  if (!lowerEmail) throw new Error("Email vacío");

  const existing = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:G1000`);
  const idx = existing.findIndex((r) => (r[0] || "").toString().trim().toLowerCase() === lowerEmail);

  const rolValue = input.perms.includes("*") ? "admin" : "user";
  const permsValue = input.perms.includes("*") ? "*" : input.perms.join(",");
  const rowData = [
    lowerEmail,
    input.name,
    rolValue,
    "ALL",
    permsValue,
    input.active ? "TRUE" : "FALSE",
    new Date().toISOString(),
  ];

  if (idx >= 0) {
    const sheetRow = idx + 2;
    // Preservar fecha de creación si existe
    const existingCreated = existing[idx][6];
    if (existingCreated) rowData[6] = existingCreated.toString();
    await sheets.spreadsheets.values.update({
      spreadsheetId: ERP_CONFIG_SHEET,
      range: `${TAB}!A${sheetRow}:G${sheetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [rowData] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: ERP_CONFIG_SHEET,
      range: `${TAB}!A:G`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [rowData] },
    });
  }
  invalidateUserCache(lowerEmail);
}

/**
 * Eliminar un usuario (solo el owner). No permite eliminar al owner.
 */
export async function deleteUser(email: string): Promise<void> {
  const lower = email.toLowerCase().trim();
  if (lower === OWNER_EMAIL) throw new Error("No se puede eliminar al owner");

  await ensureUsuariosTab();
  const sheets = getSheets();
  const existing = await readSheetRaw(ERP_CONFIG_SHEET, `${TAB}!A2:G1000`);
  const idx = existing.findIndex((r) => (r[0] || "").toString().trim().toLowerCase() === lower);
  if (idx < 0) return;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: ERP_CONFIG_SHEET,
    fields: "sheets(properties(title,sheetId))",
  });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === TAB)?.properties?.sheetId;
  if (sheetId === undefined) return;

  const sheetRow = idx + 2;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ERP_CONFIG_SHEET,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: sheetRow - 1, endIndex: sheetRow },
        },
      }],
    },
  });
  invalidateUserCache(lower);
}
