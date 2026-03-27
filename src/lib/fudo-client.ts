import {
  SucursalConfig,
  JsonApiResponse,
  JsonApiResource,
  FudoSaleAttributes,
  FudoItemAttributes,
  FudoPaymentAttributes,
  FudoPaymentMethodAttributes,
  FudoProductAttributes,
  ParsedSale,
  ParsedItem,
  ParsedPayment,
  ParsedProduct,
} from "@/types";

// ===== Constantes de la API de Fudo =====
const FUDO_AUTH_URL = "https://auth.fu.do/api";
const FUDO_API_BASE = "https://api.fu.do/v1alpha1";
const MAX_PAGE_SIZE = 500;

// Cache de JWT tokens por sucursal (en memoria del servidor)
const tokenCache: Map<string, { jwt: string; expiresAt: number }> = new Map();

// Cache de datos por clave (5 minutos)
const dataCache: Map<string, { data: unknown; expiresAt: number }> = new Map();
const DATA_CACHE_TTL = 5 * 60 * 1000;

// Cache de productos por sucursal (para resolver nombres)
const productNameCache: Map<string, Map<string, string>> = new Map();

// Rate limiting: una request a la vez por sucursal, con delay entre requests
const requestQueues: Map<string, Promise<unknown>> = new Map();
const REQUEST_DELAY_MS = 1000; // 1 segundo entre requests

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimitedFetch(
  sucursalId: string,
  fn: () => Promise<Response>
): Promise<Response> {
  const prev = requestQueues.get(sucursalId) || Promise.resolve();
  const next = prev.then(async () => {
    await delay(REQUEST_DELAY_MS);
    return fn();
  });
  requestQueues.set(sucursalId, next.catch(() => {}));
  return next;
}

async function fetchWithRetry(
  sucursalId: string,
  fn: () => Promise<Response>,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await rateLimitedFetch(sucursalId, fn);
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 3000;
      await delay(waitMs);
      lastError = new Error(`429 Too Many Requests`);
      continue;
    }
    return response;
  }
  throw lastError || new Error("Max retries exceeded");
}

// ===== Autenticación =====

async function getAuthToken(sucursal: SucursalConfig): Promise<string> {
  const cached = tokenCache.get(sucursal.id);
  if (cached && cached.expiresAt > Date.now() + 60 * 60 * 1000) {
    return cached.jwt;
  }

  const response = await fetchWithRetry(sucursal.id, () =>
    fetch(FUDO_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        apiKey: sucursal.apiKey,
        apiSecret: sucursal.apiSecret,
      }),
    })
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Error autenticando con Fudo (${sucursal.name}): ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  const data = await response.json();
  const jwt = data.token;
  const expiresAt = data.exp ? data.exp * 1000 : Date.now() + 23 * 60 * 60 * 1000;

  tokenCache.set(sucursal.id, { jwt, expiresAt });
  return jwt;
}

// ===== Fetch genérico =====

async function fudoFetch<T>(
  sucursal: SucursalConfig,
  endpoint: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${FUDO_API_BASE}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );
  }

  const cacheKey = `${sucursal.id}:${url.toString()}`;
  const cached = dataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const jwt = await getAuthToken(sucursal);

  let response = await fetchWithRetry(sucursal.id, () =>
    fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/json",
      },
    })
  );

  if (response.status === 401) {
    tokenCache.delete(sucursal.id);
    const newJwt = await getAuthToken(sucursal);
    response = await fetchWithRetry(sucursal.id, () =>
      fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${newJwt}`,
          Accept: "application/json",
        },
      })
    );
  }

  if (!response.ok) {
    throw new Error(
      `Error Fudo (${sucursal.name}): ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  dataCache.set(cacheKey, { data, expiresAt: Date.now() + DATA_CACHE_TTL });
  return data;
}

// ===== Helpers para parsear JSON:API =====

function findIncluded(
  included: JsonApiResource[] | undefined,
  type: string,
  id: string
): JsonApiResource | undefined {
  return included?.find((r) => r.type === type && r.id === id);
}

function getRelationshipId(
  resource: JsonApiResource,
  relName: string
): string | null {
  const rel = resource.relationships?.[relName];
  if (!rel || !rel.data || Array.isArray(rel.data)) return null;
  return rel.data.id;
}

function getRelationshipIds(
  resource: JsonApiResource,
  relName: string
): string[] {
  const rel = resource.relationships?.[relName];
  if (!rel || !rel.data) return [];
  if (Array.isArray(rel.data)) return rel.data.map((r) => r.id);
  return [rel.data.id];
}

// ===== Parseo de ventas =====

function parseSalesPage(
  response: JsonApiResponse<FudoSaleAttributes>,
  productNames: Map<string, string>
): ParsedSale[] {
  const { data, included } = response;

  return data.map((saleResource) => {
    const attrs = saleResource.attributes;

    // Parsear items
    const itemIds = getRelationshipIds(saleResource as unknown as JsonApiResource, "items");
    const items: ParsedItem[] = itemIds
      .map((itemId) => {
        const itemResource = findIncluded(included, "Item", itemId);
        if (!itemResource) return null;
        const itemAttrs = itemResource.attributes as unknown as FudoItemAttributes;
        const productId = getRelationshipId(itemResource, "product") || "";
        return {
          id: itemResource.id,
          productId,
          productName: productNames.get(productId) || `Producto #${productId}`,
          price: itemAttrs.price || 0,
          quantity: itemAttrs.quantity || 1,
          canceled: !!itemAttrs.canceled,
        };
      })
      .filter((item): item is ParsedItem => item !== null);

    // Parsear payments
    const paymentIds = getRelationshipIds(saleResource as unknown as JsonApiResource, "payments");
    const payments: ParsedPayment[] = paymentIds
      .map((paymentId) => {
        const paymentResource = findIncluded(included, "Payment", paymentId);
        if (!paymentResource) return null;
        const paymentAttrs = paymentResource.attributes as unknown as FudoPaymentAttributes;
        const methodId = getRelationshipId(paymentResource, "paymentMethod") || "";
        const methodResource = findIncluded(included, "PaymentMethod", methodId);
        const methodAttrs = methodResource?.attributes as unknown as FudoPaymentMethodAttributes | undefined;
        return {
          id: paymentResource.id,
          amount: paymentAttrs.amount || 0,
          canceled: !!paymentAttrs.canceled,
          methodId,
          methodName: methodAttrs?.name || `Método #${methodId}`,
        };
      })
      .filter((p): p is ParsedPayment => p !== null);

    const tableId = getRelationshipId(saleResource as unknown as JsonApiResource, "table");

    return {
      id: saleResource.id,
      closedAt: attrs.closedAt,
      createdAt: attrs.createdAt,
      total: attrs.total || 0,
      people: attrs.people || 0,
      saleType: attrs.saleType || "",
      saleState: attrs.saleState || "",
      items,
      payments,
      tableId,
    };
  });
}

// ===== Funciones públicas =====

async function loadProductNames(sucursal: SucursalConfig): Promise<Map<string, string>> {
  const cached = productNameCache.get(sucursal.id);
  if (cached && cached.size > 0) return cached;

  const products = await getProducts(sucursal);
  const nameMap = new Map<string, string>();
  products.forEach((p) => nameMap.set(p.id, p.name));
  productNameCache.set(sucursal.id, nameMap);
  return nameMap;
}

/**
 * Obtiene ventas de una sucursal filtradas por rango de fechas.
 * La API de Fudo NO soporta filtros de fecha como query params,
 * así que traemos ordenadas por fecha desc y paramos al salir del rango.
 */
export async function getSales(
  sucursal: SucursalConfig,
  from: string,
  to: string
): Promise<ParsedSale[]> {
  // Cache por sucursal+rango
  const cacheKey = `sales:${sucursal.id}:${from}:${to}`;
  const cached = dataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as ParsedSale[];
  }

  const productNames = await loadProductNames(sucursal);

  // Usar timezone local (Argentina UTC-3) para filtrar por día calendario
  const fromDate = new Date(from + "T00:00:00-03:00");
  const toDate = new Date(to + "T23:59:59-03:00");

  let allSales: ParsedSale[] = [];
  let pageNumber = 1;
  let reachedBeforeRange = false;

  while (!reachedBeforeRange) {
    const response = await fudoFetch<JsonApiResponse<FudoSaleAttributes>>(
      sucursal,
      "/sales",
      {
        sort: "-createdAt",
        include: "items,payments.paymentMethod",
        "page[size]": String(MAX_PAGE_SIZE),
        "page[number]": String(pageNumber),
      }
    );

    if (!response.data || response.data.length === 0) break;

    const sales = parseSalesPage(response, productNames);

    for (const sale of sales) {
      const saleDate = new Date(sale.closedAt || sale.createdAt);

      // Si la venta es posterior al rango, skip
      if (saleDate > toDate) continue;

      // Si la venta es anterior al rango, terminamos
      if (saleDate < fromDate) {
        reachedBeforeRange = true;
        break;
      }

      // Dentro del rango
      allSales.push(sale);
    }

    // Si recibimos menos que el page size, no hay más páginas
    if (response.data.length < MAX_PAGE_SIZE) break;

    pageNumber++;
    if (pageNumber > 100) break; // Safety
  }

  // Guardar en cache
  dataCache.set(cacheKey, { data: allSales, expiresAt: Date.now() + DATA_CACHE_TTL });

  return allSales;
}

export async function getProducts(
  sucursal: SucursalConfig
): Promise<ParsedProduct[]> {
  let allProducts: ParsedProduct[] = [];
  let pageNumber = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fudoFetch<JsonApiResponse<FudoProductAttributes>>(
      sucursal,
      "/products",
      {
        "page[size]": String(MAX_PAGE_SIZE),
        "page[number]": String(pageNumber),
      }
    );

    const products = response.data.map((r) => ({
      id: r.id,
      name: r.attributes.name,
      price: r.attributes.price,
      categoryId: getRelationshipId(r as unknown as JsonApiResource, "productCategory"),
      active: r.attributes.active,
      code: r.attributes.code,
    }));

    allProducts = allProducts.concat(products);
    hasMore = response.data.length >= MAX_PAGE_SIZE;
    pageNumber++;
    if (pageNumber > 20) break;
  }

  return allProducts;
}

export function clearCache(): void {
  dataCache.clear();
  tokenCache.clear();
  productNameCache.clear();
}
