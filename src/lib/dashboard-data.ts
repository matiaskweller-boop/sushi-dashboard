import { SUCURSALES } from "./sucursales";
import { getSales } from "./fudo-client";
import {
  DashboardData,
  SucursalKPIs,
  HourlySalesData,
  PaymentMethodData,
  TopProduct,
  ParsedSale,
  SucursalId,
  KPIs,
  AdvancedKPIsData,
  AdvancedKPIsSucursal,
  ProductAnalyticsData,
  CategoryAnalytics,
  TimeSlotAnalytics,
  ConsumptionData,
  ConsumptionProduct,
  CategoryConsumption,
  LowMovementProduct,
} from "@/types";
import { format } from "date-fns";
import { getCanonicalName, getNormalizedKey, getCanonicalCategory } from "./product-aliases";

// ===== Cache de resultados a nivel dashboard =====
const dashboardResultCache: Map<string, { data: DashboardData; expiresAt: number }> = new Map();
const DASHBOARD_CACHE_TTL = 2 * 60 * 1000; // 2 minutos

// Extract Argentina hour/day regardless of server timezone (works on both UTC/Vercel and local)
const argFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour: "numeric",
  hour12: false,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getArgentinaHour(date: Date): number {
  const parts = argFormatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return parseInt(hourPart?.value || "0", 10);
}

function getArgentinaDayOfWeek(date: Date): number {
  const day = date.toLocaleDateString("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
  });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[day] ?? 0;
}

function formatArgentinaDate(date: Date, fmt: string): string {
  // For format patterns like "yyyy-MM" and "yyyy-MM-dd", extract parts in AR timezone
  const parts = argFormatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  if (fmt === "yyyy-MM") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in Argentina timezone as "yyyy-MM-dd".
 * Critical: on Vercel (UTC), new Date() at 23:00 AR = next day in UTC.
 */
function getArgentinaTodayStr(): string {
  const now = new Date();
  return formatArgentinaDate(now, "yyyy-MM-dd");
}

/**
 * Subtract days from a "yyyy-MM-dd" string and return "yyyy-MM-dd".
 */
function subtractDays(dateStr: string, days: number): string {
  // Parse as noon UTC to avoid DST edge cases
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return format(d, "yyyy-MM-dd");
}

function getDateRange(
  period: string,
  customFrom?: string,
  customTo?: string
): { from: string; to: string; prevFrom: string; prevTo: string } {
  // Always compute "today" in Argentina timezone
  const todayStr = getArgentinaTodayStr();
  let from: string;
  let to: string;

  switch (period) {
    case "yesterday":
      from = subtractDays(todayStr, 1);
      to = subtractDays(todayStr, 1);
      break;
    case "7days":
      from = subtractDays(todayStr, 6);
      to = todayStr;
      break;
    case "30days":
      from = subtractDays(todayStr, 29);
      to = todayStr;
      break;
    case "custom":
      from = customFrom || todayStr;
      to = customTo || todayStr;
      break;
    case "today":
    default:
      from = todayStr;
      to = todayStr;
      break;
  }

  // Calculate previous period (same length, immediately before)
  const fromDate = new Date(from + "T12:00:00Z");
  const toDate = new Date(to + "T12:00:00Z");
  const rangeDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const prevTo = subtractDays(from, 1);
  const prevFrom = subtractDays(from, rangeDays);

  return { from, to, prevFrom, prevTo };
}

function isLunch(sale: ParsedSale): boolean {
  const hour = getArgentinaHour(new Date(sale.closedAt || sale.createdAt));
  return hour >= 12 && hour < 17;
}

function calcTicketByShift(sales: ParsedSale[]): { lunch: number; dinner: number } {
  const lunchSales = sales.filter(isLunch);
  const dinnerSales = sales.filter((s) => !isLunch(s));
  const lunchPax = lunchSales.reduce((sum, s) => sum + (s.people || 1), 0);
  const dinnerPax = dinnerSales.reduce((sum, s) => sum + (s.people || 1), 0);
  const lunchRevenue = lunchSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const dinnerRevenue = dinnerSales.reduce((sum, s) => sum + (s.total || 0), 0);
  return {
    lunch: lunchPax > 0 ? lunchRevenue / lunchPax : 0,
    dinner: dinnerPax > 0 ? dinnerRevenue / dinnerPax : 0,
  };
}

function calcKPIs(
  currentSales: ParsedSale[],
  prevSales: ParsedSale[]
): KPIs {
  // Include all non-canceled sales (CLOSED + OPEN) to match Fudo totals
  const validCurrent = currentSales.filter((s) => s.saleState !== "CANCELED");
  const validPrev = prevSales.filter((s) => s.saleState !== "CANCELED");

  const totalSales = validCurrent.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalOrders = validCurrent.length;
  const totalPeople = validCurrent.reduce((sum, s) => sum + (s.people || 1), 0);
  const avgTicket = totalPeople > 0 ? totalSales / totalPeople : 0;
  const shiftTickets = calcTicketByShift(validCurrent);

  const prevTotalSales = validPrev.reduce((sum, s) => sum + (s.total || 0), 0);
  const prevTotalOrders = validPrev.length;
  const prevTotalPeople = validPrev.reduce((sum, s) => sum + (s.people || 1), 0);
  const prevAvgTicket = prevTotalPeople > 0 ? prevTotalSales / prevTotalPeople : 0;

  return {
    totalSales,
    totalOrders,
    totalPax: totalPeople,
    avgTicket,
    avgTicketLunch: shiftTickets.lunch,
    avgTicketDinner: shiftTickets.dinner,
    prevTotalSales,
    prevTotalOrders,
    prevTotalPax: prevTotalPeople,
    prevAvgTicket,
  };
}

function calcSucursalKPIs(
  sales: ParsedSale[],
  sucursalId: SucursalId,
  name: string,
  color: string,
  error?: string
): SucursalKPIs {
  const valid = sales.filter((s) => s.saleState !== "CANCELED");
  const totalSales = valid.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalOrders = valid.length;
  const totalPax = valid.reduce((sum, s) => sum + (s.people || 1), 0);
  const avgTicket = totalPax > 0 ? totalSales / totalPax : 0;

  // Calcular desglose de medios de pago
  const paymentAmounts: Record<string, number> = {};
  let totalPayments = 0;
  valid.forEach((sale) => {
    sale.payments
      .filter((p) => !p.canceled)
      .forEach((p) => {
        const method = p.methodName || "Otro";
        paymentAmounts[method] = (paymentAmounts[method] || 0) + p.amount;
        totalPayments += p.amount;
      });
  });

  const paymentBreakdown = Object.entries(paymentAmounts)
    .map(([method, amount]) => ({
      method,
      amount,
      percentage: totalPayments > 0 ? Math.round((amount / totalPayments) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const mainPaymentMethod = paymentBreakdown[0]?.method || "Sin datos";

  // Ticket y % almuerzo/cena
  const shiftTickets = calcTicketByShift(valid);
  const lunchSales = valid.filter(isLunch);
  const dinnerSales = valid.filter((s) => !isLunch(s));
  const lunchRevenue = lunchSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const dinnerRevenue = dinnerSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const lunchPct = totalSales > 0 ? Math.round((lunchRevenue / totalSales) * 100) : 0;
  const dinnerPct = totalSales > 0 ? 100 - lunchPct : 0;

  return {
    sucursalId,
    name,
    color,
    totalSales,
    totalOrders,
    totalPax,
    avgTicket,
    avgTicketLunch: shiftTickets.lunch,
    avgTicketDinner: shiftTickets.dinner,
    lunchRevenue,
    dinnerRevenue,
    lunchPct,
    dinnerPct,
    mainPaymentMethod,
    paymentBreakdown,
    error,
  };
}

function calcHourlySales(
  salesBySucursal: Record<SucursalId, ParsedSale[]>
): HourlySalesData[] {
  const hours: HourlySalesData[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    palermo: 0,
    belgrano: 0,
    puerto: 0,
  }));

  for (const [sucursalId, sales] of Object.entries(salesBySucursal)) {
    sales
      .filter((s) => s.saleState !== "CANCELED")
      .forEach((sale) => {
        const dateStr = sale.closedAt || sale.createdAt;
        if (dateStr) {
          const hour = getArgentinaHour(new Date(dateStr));
          if (hour >= 0 && hour < 24) {
            hours[hour][sucursalId as SucursalId] += sale.total || 0;
          }
        }
      });
  }

  return hours;
}

function calcPaymentMethods(allSales: ParsedSale[]): PaymentMethodData[] {
  const methods: Record<string, number> = {};
  let total = 0;

  allSales
    .filter((s) => s.saleState !== "CANCELED")
    .forEach((sale) => {
      sale.payments
        .filter((p) => !p.canceled)
        .forEach((p) => {
          const method = p.methodName || "Otro";
          methods[method] = (methods[method] || 0) + p.amount;
          total += p.amount;
        });
    });

  return Object.entries(methods)
    .map(([method, amount]) => ({
      method,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

// Filter out common beverages from product rankings
const BEVERAGE_FILTER_RE = /agua|gaseosa|soda|coca|sprite|fanta|schweppes/i;

function calcTopProducts(
  sales: ParsedSale[],
  limit: number = 10
): TopProduct[] {
  const products: Record<string, { quantity: number; revenue: number; displayName: string }> = {};

  sales
    .filter((s) => s.saleState !== "CANCELED")
    .forEach((sale) => {
      sale.items
        .filter((item) => !item.canceled && !BEVERAGE_FILTER_RE.test(item.productName))
        .forEach((item) => {
          const key = getNormalizedKey(item.productName);
          const displayName = getCanonicalName(item.productName);
          if (!products[key]) {
            products[key] = { quantity: 0, revenue: 0, displayName };
          }
          products[key].quantity += item.quantity || 1;
          products[key].revenue += item.price * item.quantity || 0;
        });
    });

  return Object.entries(products)
    .map(([, data]) => ({ quantity: data.quantity, revenue: data.revenue, name: data.displayName, rank: 0 }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export async function getDashboardData(
  period: string,
  customFrom?: string,
  customTo?: string
): Promise<DashboardData> {
  const { from, to, prevFrom, prevTo } = getDateRange(
    period,
    customFrom,
    customTo
  );

  // Check dashboard-level cache first
  const cacheKey = `dashboard:${from}:${to}:${prevFrom}:${prevTo}`;
  const cached = dashboardResultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const errors: string[] = [];
  const salesBySucursal: Record<SucursalId, ParsedSale[]> = {
    palermo: [],
    belgrano: [],
    puerto: [],
  };
  const prevSalesBySucursal: Record<SucursalId, ParsedSale[]> = {
    palermo: [],
    belgrano: [],
    puerto: [],
  };

  // Consultar todas las sucursales y períodos en paralelo
  // (cada sucursal tiene su propio rate limit queue, y current+prev pueden correr simultáneo)
  const fetchPromises = SUCURSALES.flatMap((sucursal) => [
    getSales(sucursal, from, to)
      .then((sales) => { salesBySucursal[sucursal.id] = sales; })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Error desconocido";
        errors.push(`Error al obtener datos de ${sucursal.name}: ${message}`);
      }),
    getSales(sucursal, prevFrom, prevTo)
      .then((sales) => { prevSalesBySucursal[sucursal.id] = sales; })
      .catch(() => { /* Error en período anterior no es crítico */ }),
  ]);
  await Promise.all(fetchPromises);

  // Consolidar datos
  const allCurrentSales = Object.values(salesBySucursal).flat();
  const allPrevSales = Object.values(prevSalesBySucursal).flat();

  const kpis = calcKPIs(allCurrentSales, allPrevSales);

  const sucursalKPIs = SUCURSALES.map((s) => {
    const sucursalError = errors.find((e) => e.includes(s.name));
    return calcSucursalKPIs(
      salesBySucursal[s.id],
      s.id,
      s.name,
      s.color,
      sucursalError
    );
  });

  const hourlySales = calcHourlySales(salesBySucursal);
  const paymentMethods = calcPaymentMethods(allCurrentSales);

  const topProducts = {
    all: calcTopProducts(allCurrentSales),
    palermo: calcTopProducts(salesBySucursal.palermo),
    belgrano: calcTopProducts(salesBySucursal.belgrano),
    puerto: calcTopProducts(salesBySucursal.puerto),
  };

  const result: DashboardData = {
    kpis,
    sucursalKPIs,
    hourlySales,
    paymentMethods,
    topProducts,
    errors,
    lastUpdated: new Date().toISOString(),
  };

  // Cache result for 2 minutes (only if no errors)
  if (errors.length === 0) {
    dashboardResultCache.set(cacheKey, { data: result, expiresAt: Date.now() + DASHBOARD_CACHE_TTL });
  }

  return result;
}

// ===== Advanced KPIs =====

const SEAT_COUNTS: Record<SucursalId, number> = {
  palermo: 22,
  belgrano: 32,
  puerto: 46,
};

const HOURS_OPEN = 8;

function calcAdvancedKPIsForSales(sales: ParsedSale[]): {
  avgDurationMinutes: number;
  avgPeoplePerOrder: number;
  avgItemsPerOrder: number;
  totalRevenue: number;
  totalItems: number;
  canceledItems: number;
} {
  const closed = sales.filter((s) => s.saleState !== "CANCELED");

  // Average duration
  const durations = closed
    .filter((s) => s.closedAt && s.createdAt)
    .map((s) => {
      const created = new Date(s.createdAt).getTime();
      const closedAt = new Date(s.closedAt!).getTime();
      return (closedAt - created) / (1000 * 60);
    })
    .filter((d) => d > 0 && d < 600); // filter outliers > 10 hours

  const avgDurationMinutes =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

  // Average people
  const avgPeoplePerOrder =
    closed.length > 0
      ? closed.reduce((sum, s) => sum + (s.people || 1), 0) / closed.length
      : 0;

  // Items
  let totalItems = 0;
  let canceledItems = 0;
  closed.forEach((sale) => {
    sale.items.forEach((item) => {
      totalItems += item.quantity || 1;
      if (item.canceled) {
        canceledItems += item.quantity || 1;
      }
    });
  });

  const avgItemsPerOrder = closed.length > 0 ? totalItems / closed.length : 0;
  const totalRevenue = closed.reduce((sum, s) => sum + (s.total || 0), 0);

  return {
    avgDurationMinutes,
    avgPeoplePerOrder,
    avgItemsPerOrder,
    totalRevenue,
    totalItems,
    canceledItems,
  };
}

function calcHourlyOrderCounts(
  salesBySucursal: Record<SucursalId, ParsedSale[]>
): HourlySalesData[] {
  const hours: HourlySalesData[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    palermo: 0,
    belgrano: 0,
    puerto: 0,
  }));

  for (const [sucursalId, sales] of Object.entries(salesBySucursal)) {
    sales
      .filter((s) => s.saleState !== "CANCELED")
      .forEach((sale) => {
        const dateStr = sale.createdAt;
        if (dateStr) {
          const hour = getArgentinaHour(new Date(dateStr));
          if (hour >= 0 && hour < 24) {
            hours[hour][sucursalId as SucursalId] += 1;
          }
        }
      });
  }

  return hours;
}

function calcPeopleDistribution(
  sales: ParsedSale[]
): { people: string; count: number }[] {
  const closed = sales.filter((s) => s.saleState !== "CANCELED");
  const counts: Record<string, number> = {};

  closed.forEach((sale) => {
    const p = sale.people || 1;
    const key = p >= 5 ? "5+" : String(p);
    counts[key] = (counts[key] || 0) + 1;
  });

  const order = ["1", "2", "3", "4", "5+"];
  return order
    .filter((k) => counts[k])
    .map((k) => ({ people: k, count: counts[k] }));
}

export async function getAdvancedKPIs(
  period: string,
  customFrom?: string,
  customTo?: string
): Promise<AdvancedKPIsData> {
  const { from, to, prevFrom, prevTo } = getDateRange(period, customFrom, customTo);

  const errors: string[] = [];
  const salesBySucursal: Record<SucursalId, ParsedSale[]> = {
    palermo: [],
    belgrano: [],
    puerto: [],
  };

  // Fetch current + previous period in parallel for growth comparison
  const prevSalesBySucursal: Record<SucursalId, ParsedSale[]> = {
    palermo: [], belgrano: [], puerto: [],
  };

  await Promise.all(
    SUCURSALES.flatMap((sucursal) => [
      getSales(sucursal, from, to)
        .then((sales) => { salesBySucursal[sucursal.id] = sales; })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Error desconocido";
          errors.push(`Error al obtener datos de ${sucursal.name}: ${message}`);
        }),
      getSales(sucursal, prevFrom, prevTo)
        .then((sales) => { prevSalesBySucursal[sucursal.id] = sales; })
        .catch(() => { /* prev period errors are not critical */ }),
    ])
  );

  const allSales = Object.values(salesBySucursal).flat();
  const globalMetrics = calcAdvancedKPIsForSales(allSales);

  // Global RevPASH: total revenue / (total seats * hours)
  const totalSeats = Object.values(SEAT_COUNTS).reduce((a, b) => a + b, 0);
  const globalRevpash =
    totalSeats * HOURS_OPEN > 0
      ? globalMetrics.totalRevenue / (totalSeats * HOURS_OPEN)
      : 0;

  // Per sucursal
  const bySucursal: AdvancedKPIsSucursal[] = SUCURSALES.map((s) => {
    const metrics = calcAdvancedKPIsForSales(salesBySucursal[s.id]);
    const seats = SEAT_COUNTS[s.id];
    const revpash =
      seats * HOURS_OPEN > 0
        ? metrics.totalRevenue / (seats * HOURS_OPEN)
        : 0;

    return {
      sucursalId: s.id,
      name: s.name,
      color: s.color,
      avgDurationMinutes: metrics.avgDurationMinutes,
      avgPeoplePerOrder: metrics.avgPeoplePerOrder,
      revpash,
      avgItemsPerOrder: metrics.avgItemsPerOrder,
    };
  });

  const hourlyOrderCounts = calcHourlyOrderCounts(salesBySucursal);
  const peopleDistribution = calcPeopleDistribution(allSales);

  // New KPIs
  const closedAll = allSales.filter((s) => s.saleState !== "CANCELED");
  const totalPeople = closedAll.reduce((sum, s) => sum + (s.people || 1), 0);
  const itemsPerPerson = totalPeople > 0 ? globalMetrics.totalItems / totalPeople : 0;

  // Revenue per minute
  const allDurations = closedAll
    .filter((s) => s.closedAt && s.createdAt)
    .map((s) => {
      const dur = (new Date(s.closedAt!).getTime() - new Date(s.createdAt).getTime()) / (1000 * 60);
      return dur > 0 && dur < 600 ? dur : 0;
    })
    .filter((d) => d > 0);
  const totalDurationMinutes = allDurations.reduce((a, b) => a + b, 0);
  const revenuePerMinute = totalDurationMinutes > 0 ? globalMetrics.totalRevenue / totalDurationMinutes : 0;

  // Top product concentration (top 5/10 by revenue, excluding beverages)
  const productRevenues: Record<string, { revenue: number; quantity: number; displayName: string }> = {};
  closedAll.forEach((sale) => {
    sale.items.filter((i) => !i.canceled).forEach((item) => {
      const key = getNormalizedKey(item.productName);
      const displayName = getCanonicalName(item.productName);
      if (!productRevenues[key]) productRevenues[key] = { revenue: 0, quantity: 0, displayName };
      productRevenues[key].revenue += item.price * item.quantity;
      productRevenues[key].quantity += item.quantity || 1;
    });
  });

  // Filter out beverages for top products
  const filteredProducts = Object.entries(productRevenues)
    .filter(([name]) => !BEVERAGE_FILTER_RE.test(name));
  const sortedProducts = filteredProducts
    .sort((a, b) => b[1].revenue - a[1].revenue);
  const totalProductRevenue = filteredProducts.reduce((sum, [, d]) => sum + d.revenue, 0);
  const top5Revenue = sortedProducts.slice(0, 5).reduce((sum, [, d]) => sum + d.revenue, 0);
  const topProductConcentration = totalProductRevenue > 0 ? (top5Revenue / totalProductRevenue) * 100 : 0;

  // Top 10 products with details (for expandable card)
  const topProducts = sortedProducts.slice(0, 10).map(([, data]) => ({
    name: data.displayName,
    revenue: data.revenue,
    quantity: data.quantity,
    percentage: totalProductRevenue > 0 ? (data.revenue / totalProductRevenue) * 100 : 0,
  }));

  // Lunch vs Dinner
  let lunchRevenue = 0, dinnerRevenue = 0, lunchOrders = 0, dinnerOrders = 0;
  closedAll.forEach((sale) => {
    const hour = getArgentinaHour(new Date(sale.createdAt));
    if (hour >= 12 && hour <= 15) {
      lunchRevenue += sale.total || 0;
      lunchOrders += 1;
    } else if (hour >= 19 || hour === 0) {
      dinnerRevenue += sale.total || 0;
      dinnerOrders += 1;
    }
  });

  // Peak hours per sucursal
  const peakHours: Record<string, { hour: number; revenue: number }> = {};
  for (const s of SUCURSALES) {
    const hourlyRev: Record<number, number> = {};
    salesBySucursal[s.id]
      .filter((sale) => sale.saleState === "CLOSED")
      .forEach((sale) => {
        const hour = getArgentinaHour(new Date(sale.createdAt));
        hourlyRev[hour] = (hourlyRev[hour] || 0) + (sale.total || 0);
      });
    const peak = Object.entries(hourlyRev).sort((a, b) => b[1] - a[1])[0];
    peakHours[s.id] = peak ? { hour: parseInt(peak[0]), revenue: peak[1] } : { hour: 0, revenue: 0 };
  }

  // Revenue heatmap (dayOfWeek x hour)
  const heatmapMap: Record<string, number> = {};
  closedAll.forEach((sale) => {
    const dtRaw = new Date(sale.createdAt);
    const dayOfWeek = getArgentinaDayOfWeek(dtRaw);
    const hour = getArgentinaHour(dtRaw);
    const key = `${dayOfWeek}-${hour}`;
    heatmapMap[key] = (heatmapMap[key] || 0) + (sale.total || 0);
  });
  const revenueHeatmap = Object.entries(heatmapMap).map(([key, revenue]) => {
    const [dow, h] = key.split("-").map(Number);
    return { dayOfWeek: dow, hour: h, revenue };
  });

  // === NEW GROWTH KPIs ===

  // 1. Growth vs same weekday previous period
  const allPrevSales = Object.values(prevSalesBySucursal).flat();
  const prevClosedAll = allPrevSales.filter((s) => s.saleState !== "CANCELED");
  const currentRevenue = closedAll.reduce((sum, s) => sum + (s.total || 0), 0);
  const prevRevenue = prevClosedAll.reduce((sum, s) => sum + (s.total || 0), 0);
  const growthVsSameWeekday = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : null;

  // 2. Revenue per person
  const revenuePerPerson = totalPeople > 0 ? currentRevenue / totalPeople : 0;

  // 3. Estimated occupancy rate
  // (total people served) / (total seats × hours open × days in range)
  const fromDate = new Date(from + "T12:00:00Z");
  const toDate = new Date(to + "T12:00:00Z");
  const daysInRange = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const totalSeatsCapacity = totalSeats * HOURS_OPEN * daysInRange; // seat-hours available
  const totalSeatHoursUsed = closedAll.reduce((sum, s) => {
    const dur = s.closedAt && s.createdAt
      ? (new Date(s.closedAt).getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60)
      : 1; // default 1 hour if no duration
    const people = s.people || 1;
    return sum + (Math.min(dur, 5) * people); // cap at 5 hours per table
  }, 0);
  const estimatedOccupancy = totalSeatsCapacity > 0 ? Math.min(100, (totalSeatHoursUsed / totalSeatsCapacity) * 100) : 0;

  return {
    global: {
      avgDurationMinutes: globalMetrics.avgDurationMinutes,
      avgPeoplePerOrder: globalMetrics.avgPeoplePerOrder,
      revpash: globalRevpash,
      avgItemsPerOrder: globalMetrics.avgItemsPerOrder,
    },
    bySucursal,
    hourlyOrderCounts,
    canceledItemsRate:
      globalMetrics.totalItems > 0
        ? globalMetrics.canceledItems / globalMetrics.totalItems
        : 0,
    totalItems: globalMetrics.totalItems,
    canceledItems: globalMetrics.canceledItems,
    peopleDistribution,
    itemsPerPerson,
    revenuePerMinute,
    topProductConcentration,
    topProducts,
    growthVsSameWeekday,
    revenuePerPerson,
    estimatedOccupancy,
    lunchRevenue,
    dinnerRevenue,
    lunchOrders,
    dinnerOrders,
    peakHours,
    revenueHeatmap,
    errors,
    lastUpdated: new Date().toISOString(),
  };
}

// ===== Product Analytics =====

function getTimeSlot(hour: number): string {
  if (hour >= 12 && hour < 16) return "Almuerzo";
  if (hour >= 16 && hour < 19) return "Tarde";
  return "Cena"; // 19-23, 0
}

export async function getProductAnalytics(
  period: string,
  customFrom?: string,
  customTo?: string
): Promise<ProductAnalyticsData> {
  const { from, to } = getDateRange(period, customFrom, customTo);

  const errors: string[] = [];
  const salesBySucursal: Record<SucursalId, ParsedSale[]> = {
    palermo: [],
    belgrano: [],
    puerto: [],
  };

  await Promise.all(
    SUCURSALES.map(async (sucursal) => {
      try {
        const sales = await getSales(sucursal, from, to);
        salesBySucursal[sucursal.id] = sales;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        errors.push(`Error al obtener datos de ${sucursal.name}: ${message}`);
      }
    })
  );

  // Global category analytics
  const categoryMap: Record<string, CategoryAnalytics> = {};
  const bySucursalCategories: Record<SucursalId, Record<string, CategoryAnalytics>> = {
    palermo: {},
    belgrano: {},
    puerto: {},
  };

  // Time slot analytics
  const timeSlotMap: Record<string, { revenue: number; orders: Set<string>; products: Record<string, number> }> = {
    Almuerzo: { revenue: 0, orders: new Set(), products: {} },
    Tarde: { revenue: 0, orders: new Set(), products: {} },
    Cena: { revenue: 0, orders: new Set(), products: {} },
  };

  for (const [sucursalId, sales] of Object.entries(salesBySucursal)) {
    const sid = sucursalId as SucursalId;
    const closed = sales.filter((s) => s.saleState !== "CANCELED");

    for (const sale of closed) {
      const hour = getArgentinaHour(new Date(sale.createdAt));
      const slot = getTimeSlot(hour);
      timeSlotMap[slot].orders.add(sale.id);

      for (const item of sale.items.filter((i) => !i.canceled)) {
        const catName = item.categoryName || "Sin categoría";
        const qty = item.quantity || 1;
        const rev = item.price * qty;

        // Global
        if (!categoryMap[catName]) {
          categoryMap[catName] = {
            categoryName: catName,
            revenue: 0,
            quantity: 0,
            bySucursal: {
              palermo: { revenue: 0, quantity: 0 },
              belgrano: { revenue: 0, quantity: 0 },
              puerto: { revenue: 0, quantity: 0 },
            },
          };
        }
        categoryMap[catName].revenue += rev;
        categoryMap[catName].quantity += qty;
        categoryMap[catName].bySucursal[sid].revenue += rev;
        categoryMap[catName].bySucursal[sid].quantity += qty;

        // Per sucursal
        if (!bySucursalCategories[sid][catName]) {
          bySucursalCategories[sid][catName] = {
            categoryName: catName,
            revenue: 0,
            quantity: 0,
            bySucursal: {
              palermo: { revenue: 0, quantity: 0 },
              belgrano: { revenue: 0, quantity: 0 },
              puerto: { revenue: 0, quantity: 0 },
            },
          };
        }
        bySucursalCategories[sid][catName].revenue += rev;
        bySucursalCategories[sid][catName].quantity += qty;

        // Time slot products
        timeSlotMap[slot].revenue += rev;
        timeSlotMap[slot].products[item.productName] =
          (timeSlotMap[slot].products[item.productName] || 0) + rev;
      }
    }
  }

  const categories = Object.values(categoryMap).sort((a, b) => b.revenue - a.revenue);

  const bySucursal: Record<SucursalId, CategoryAnalytics[]> = {
    palermo: Object.values(bySucursalCategories.palermo).sort((a, b) => b.revenue - a.revenue),
    belgrano: Object.values(bySucursalCategories.belgrano).sort((a, b) => b.revenue - a.revenue),
    puerto: Object.values(bySucursalCategories.puerto).sort((a, b) => b.revenue - a.revenue),
  };

  const timeSlots: TimeSlotAnalytics[] = ["Almuerzo", "Tarde", "Cena"].map((slot) => {
    const ts = timeSlotMap[slot];
    const topProduct = Object.entries(ts.products).sort((a, b) => b[1] - a[1])[0];
    return {
      slot,
      revenue: ts.revenue,
      orders: ts.orders.size,
      starProduct: topProduct ? topProduct[0] : null,
      starProductRevenue: topProduct ? topProduct[1] : 0,
    };
  });

  return {
    categories,
    timeSlots,
    bySucursal,
    errors,
    lastUpdated: new Date().toISOString(),
  };
}

// ===== Resúmenes mensuales desde datos live de Fudo =====

interface MonthSummary {
  totalSales: number;
  totalOrders: number;
  totalPeople: number;
  avgTicket: number;
  avgPeoplePerOrder: number;
  avgDurationMinutes: number;
  avgDailyRevenue: number;
  avgDailyOrders: number;
  daysWithData: number;
  tablesUsed: number;
  tableServices: number;
  peakHour: number;
  paymentMethods: Record<string, number>;
  hourlyRevenue: Record<string, number>;
  hourlyCounts: Record<string, number>;
  weekdayRevenue: Record<string, number>;
  weekdayOrders: Record<string, number>;
  dailyRevenue: Record<string, number>;
  dailyOrders: Record<string, number>;
  dailyPeople: Record<string, number>;
}

function buildMonthlySummaries(
  sales: ParsedSale[]
): Record<string, MonthSummary> {
  const monthly: Record<
    string,
    {
      totalSales: number;
      totalOrders: number;
      totalPeople: number;
      totalDuration: number;
      durationCount: number;
      paymentMethods: Record<string, number>;
      tables: Set<string>;
      tableServices: number;
      hourlyRevenue: Record<string, number>;
      hourlyCounts: Record<string, number>;
      dailyRevenue: Record<string, number>;
      dailyOrders: Record<string, number>;
      dailyPeople: Record<string, number>;
      weekdayRevenue: Record<string, number>;
      weekdayOrders: Record<string, number>;
    }
  > = {};

  const closed = sales.filter((s) => s.saleState !== "CANCELED");

  for (const sale of closed) {
    const created = sale.createdAt;
    if (!created) continue;

    const dt = new Date(created);
    const monthKey = formatArgentinaDate(dt, "yyyy-MM");
    const dayKey = formatArgentinaDate(dt, "yyyy-MM-dd");

    if (!monthly[monthKey]) {
      monthly[monthKey] = {
        totalSales: 0,
        totalOrders: 0,
        totalPeople: 0,
        totalDuration: 0,
        durationCount: 0,
        paymentMethods: {},
        tables: new Set(),
        tableServices: 0,
        hourlyRevenue: {},
        hourlyCounts: {},
        dailyRevenue: {},
        dailyOrders: {},
        dailyPeople: {},
        weekdayRevenue: {},
        weekdayOrders: {},
      };
    }

    const m = monthly[monthKey];
    const total = sale.total || 0;
    const people = sale.people || 1;

    m.totalSales += total;
    m.totalOrders += 1;
    m.totalPeople += people;

    if (sale.closedAt) {
      const dur =
        (new Date(sale.closedAt).getTime() - dt.getTime()) / (1000 * 60);
      if (dur > 0 && dur < 480) {
        m.totalDuration += dur;
        m.durationCount += 1;
      }
    }

    sale.payments
      .filter((p) => !p.canceled)
      .forEach((p) => {
        const method = p.methodName || "Otro";
        m.paymentMethods[method] = (m.paymentMethods[method] || 0) + p.amount;
      });

    if (sale.tableId) {
      m.tables.add(sale.tableId);
      m.tableServices += 1;
    }

    const hour = String(getArgentinaHour(dt));
    m.hourlyRevenue[hour] = (m.hourlyRevenue[hour] || 0) + total;
    m.hourlyCounts[hour] = (m.hourlyCounts[hour] || 0) + 1;

    m.dailyRevenue[dayKey] = (m.dailyRevenue[dayKey] || 0) + total;
    m.dailyOrders[dayKey] = (m.dailyOrders[dayKey] || 0) + 1;
    m.dailyPeople[dayKey] = (m.dailyPeople[dayKey] || 0) + people;

    const wd = String(getArgentinaDayOfWeek(dt));
    m.weekdayRevenue[wd] = (m.weekdayRevenue[wd] || 0) + total;
    m.weekdayOrders[wd] = (m.weekdayOrders[wd] || 0) + 1;
  }

  const result: Record<string, MonthSummary> = {};
  for (const [monthKey, m] of Object.entries(monthly)) {
    const daysWithData = Object.keys(m.dailyRevenue).length;
    const peakHour =
      Object.entries(m.hourlyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "0";

    result[monthKey] = {
      totalSales: Math.round(m.totalSales * 100) / 100,
      totalOrders: m.totalOrders,
      totalPeople: m.totalPeople,
      avgTicket:
        m.totalPeople > 0
          ? Math.round((m.totalSales / m.totalPeople) * 100) / 100
          : 0,
      avgPeoplePerOrder:
        m.totalOrders > 0
          ? Math.round((m.totalPeople / m.totalOrders) * 100) / 100
          : 0,
      avgDurationMinutes:
        m.durationCount > 0
          ? Math.round((m.totalDuration / m.durationCount) * 10) / 10
          : 0,
      avgDailyRevenue:
        daysWithData > 0 ? Math.round(m.totalSales / daysWithData) : 0,
      avgDailyOrders:
        daysWithData > 0
          ? Math.round((m.totalOrders / daysWithData) * 10) / 10
          : 0,
      daysWithData,
      tablesUsed: m.tables.size,
      tableServices: m.tableServices,
      peakHour: parseInt(peakHour),
      paymentMethods: m.paymentMethods,
      hourlyRevenue: m.hourlyRevenue,
      hourlyCounts: m.hourlyCounts,
      weekdayRevenue: m.weekdayRevenue,
      weekdayOrders: m.weekdayOrders,
      dailyRevenue: m.dailyRevenue,
      dailyOrders: m.dailyOrders,
      dailyPeople: m.dailyPeople,
    };
  }

  return result;
}

// Cache para resúmenes live (30 min)
const liveSummaryCache: Map<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { data: any; expiresAt: number }
> = new Map();

/**
 * Obtiene resúmenes mensuales de datos actuales de Fudo (desde oct 2025).
 * Se cachea 30 minutos para no saturar la API.
 */
export async function getLiveMonthlySummaries(): Promise<
  Record<string, Record<string, MonthSummary>>
> {
  const cacheKey = "live-monthly-summaries";
  const cached = liveSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const result: Record<string, Record<string, MonthSummary>> = {};

  const fromDate = "2025-10-01";
  const toDate = format(new Date(), "yyyy-MM-dd");

  await Promise.all(
    SUCURSALES.map(async (sucursal) => {
      try {
        const sales = await getSales(sucursal, fromDate, toDate);
        result[sucursal.id] = buildMonthlySummaries(sales);
      } catch {
        result[sucursal.id] = {};
      }
    })
  );

  liveSummaryCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + 30 * 60 * 1000,
  });

  return result;
}

// ===== Consumption Tracking =====
// Uses stored JSON for past months + live Fudo data for current month only

import storedConsumption from "../../data/consumo-mensual.json";

// Stored format: Record<productName, { categoryName, months: Record<"YYYY-MM", { qty, bySucursal }> }>
interface StoredProductData {
  categoryName: string;
  months: Record<string, { qty: number; bySucursal: Record<string, number> }>;
}
type StoredConsumptionData = Record<string, StoredProductData>;

const consumptionCache: Map<string, { data: ConsumptionData; expiresAt: number }> = new Map();

export async function getConsumptionData(monthsBack: number = 6): Promise<ConsumptionData> {
  const cacheKey = `consumption:${monthsBack}`;
  const cached = consumptionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const errors: string[] = [];
  const todayStr = getArgentinaTodayStr();
  const currentMonthKey = todayStr.substring(0, 7); // "YYYY-MM"

  // Generate list of months we need
  // Use day=1 to avoid overflow (e.g. March 30 - 1 month = Feb 30 → Mar 2)
  const months: string[] = [];
  const [curYear, curMonth] = todayStr.split("-").map(Number);
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(curYear, curMonth - 1 - i, 1));
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    months.push(`${year}-${month}`);
  }

  // Load stored data for past months
  const stored = storedConsumption as StoredConsumptionData;
  const productMap: Map<string, {
    name: string;
    categoryName: string;
    monthlyData: Record<string, number>;
    bySucursal: Record<SucursalId, number>;
  }> = new Map();

  // Populate from stored JSON (past months only), unifying by canonical name
  for (const [productName, pData] of Object.entries(stored)) {
    for (const m of months) {
      if (m === currentMonthKey) continue; // skip current month, we'll fetch live
      const monthData = pData.months[m];
      if (!monthData) continue;

      const canonicalName = getCanonicalName(productName);
      const key = getNormalizedKey(productName);

      if (!productMap.has(key)) {
        productMap.set(key, {
          name: canonicalName,
          categoryName: getCanonicalCategory(pData.categoryName),
          monthlyData: {},
          bySucursal: { palermo: 0, belgrano: 0, puerto: 0 },
        });
      }
      const prod = productMap.get(key)!;
      prod.monthlyData[m] = (prod.monthlyData[m] || 0) + monthData.qty;
      for (const [sId, qty] of Object.entries(monthData.bySucursal)) {
        prod.bySucursal[sId as SucursalId] += qty;
      }
    }
  }

  // Fetch ONLY current month live from Fudo (fast!)
  const firstDayOfMonth = `${currentMonthKey}-01`;
  await Promise.all(
    SUCURSALES.map(async (sucursal) => {
      try {
        const sales = await getSales(sucursal, firstDayOfMonth, todayStr);
        const validSales = sales.filter((s) => s.saleState !== "CANCELED");
        for (const sale of validSales) {
          for (const item of sale.items) {
            if (item.canceled) continue;
            const canonicalName = getCanonicalName(item.productName);
            const mapKey = getNormalizedKey(item.productName);
            if (!productMap.has(mapKey)) {
              productMap.set(mapKey, {
                name: canonicalName,
                categoryName: getCanonicalCategory(item.categoryName || "Sin categoria"),
                monthlyData: {},
                bySucursal: { palermo: 0, belgrano: 0, puerto: 0 },
              });
            }
            const prod = productMap.get(mapKey)!;
            prod.monthlyData[currentMonthKey] = (prod.monthlyData[currentMonthKey] || 0) + (item.quantity || 1);
            prod.bySucursal[sucursal.id] += (item.quantity || 1);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        errors.push(`Error ${sucursal.name}: ${message}`);
      }
    })
  );

  // Build products array with totals and trends
  const products: ConsumptionProduct[] = Array.from(productMap.values()).map((p) => {
    const totalQuantity = Object.values(p.monthlyData).reduce((a, b) => a + b, 0);

    const lastMonth = months[months.length - 1];
    const lastMonthQty = p.monthlyData[lastMonth] || 0;
    const prevMonths = months.slice(0, -1);
    const prevAvg = prevMonths.length > 0
      ? prevMonths.reduce((sum, m) => sum + (p.monthlyData[m] || 0), 0) / prevMonths.length
      : 0;
    const trend = prevAvg > 0 ? ((lastMonthQty - prevAvg) / prevAvg) * 100 : 0;

    return {
      name: p.name,
      categoryName: p.categoryName,
      totalQuantity,
      monthlyData: p.monthlyData,
      bySucursal: p.bySucursal,
      trend,
    };
  }).sort((a, b) => b.totalQuantity - a.totalQuantity);

  // Build category totals
  const catMap: Map<string, { totalQuantity: number; monthlyData: Record<string, number> }> = new Map();
  for (const p of products) {
    if (!catMap.has(p.categoryName)) {
      catMap.set(p.categoryName, { totalQuantity: 0, monthlyData: {} });
    }
    const cat = catMap.get(p.categoryName)!;
    cat.totalQuantity += p.totalQuantity;
    for (const [m, qty] of Object.entries(p.monthlyData)) {
      cat.monthlyData[m] = (cat.monthlyData[m] || 0) + qty;
    }
  }
  const categories: CategoryConsumption[] = Array.from(catMap.entries())
    .map(([categoryName, data]) => ({ categoryName, ...data }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  // Identify low-movement products: had sales before but stopped, or very low
  const lowMovement: LowMovementProduct[] = products
    .filter((p) => {
      // Has at least some history but recent months are zero/very low
      const lastTwoMonths = months.slice(-2);
      const recentQty = lastTwoMonths.reduce((s, m) => s + (p.monthlyData[m] || 0), 0);
      const olderMonths = months.slice(0, -2);
      const olderQty = olderMonths.reduce((s, m) => s + (p.monthlyData[m] || 0), 0);
      // Product had sales before but stopped, or very low trend
      return (olderQty > 0 && recentQty === 0) || (p.totalQuantity > 0 && p.trend < -50);
    })
    .map((p) => {
      // Find last month with sales
      let lastSoldMonth: string | null = null;
      let monthsWithoutSales = 0;
      for (let i = months.length - 1; i >= 0; i--) {
        if ((p.monthlyData[months[i]] || 0) > 0) {
          lastSoldMonth = months[i];
          monthsWithoutSales = months.length - 1 - i;
          break;
        }
      }
      return {
        name: p.name,
        categoryName: p.categoryName,
        totalQuantity: p.totalQuantity,
        lastSoldMonth,
        monthsWithoutSales,
      };
    })
    .sort((a, b) => b.monthsWithoutSales - a.monthsWithoutSales || b.totalQuantity - a.totalQuantity);

  const result: ConsumptionData = {
    products,
    categories,
    lowMovement,
    months,
    errors,
    lastUpdated: new Date().toISOString(),
  };

  // Cache for 10 min (only current month is live)
  consumptionCache.set(cacheKey, { data: result, expiresAt: Date.now() + 10 * 60 * 1000 });

  return result;
}
