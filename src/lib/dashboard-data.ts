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
} from "@/types";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

function formatDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function getDateRange(
  period: string,
  customFrom?: string,
  customTo?: string
): { from: string; to: string; prevFrom: string; prevTo: string } {
  const now = new Date();
  let from: Date;
  let to: Date = endOfDay(now);

  switch (period) {
    case "7days":
      from = startOfDay(subDays(now, 6));
      break;
    case "30days":
      from = startOfDay(subDays(now, 29));
      break;
    case "custom":
      from = customFrom ? new Date(customFrom) : startOfDay(now);
      to = customTo ? new Date(customTo) : endOfDay(now);
      break;
    case "today":
    default:
      from = startOfDay(now);
      break;
  }

  const rangeDays = Math.ceil(
    (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)
  );
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = startOfDay(subDays(prevTo, rangeDays - 1));

  return {
    from: formatDate(from),
    to: formatDate(to),
    prevFrom: formatDate(prevFrom),
    prevTo: formatDate(prevTo),
  };
}

function calcKPIs(
  currentSales: ParsedSale[],
  prevSales: ParsedSale[]
): KPIs {
  const closedCurrent = currentSales.filter((s) => s.saleState === "CLOSED");
  const closedPrev = prevSales.filter((s) => s.saleState === "CLOSED");

  const totalSales = closedCurrent.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalOrders = closedCurrent.length;
  const totalPeople = closedCurrent.reduce((sum, s) => sum + (s.people || 1), 0);
  const avgTicket = totalPeople > 0 ? totalSales / totalPeople : 0;

  const prevTotalSales = closedPrev.reduce((sum, s) => sum + (s.total || 0), 0);
  const prevTotalOrders = closedPrev.length;
  const prevTotalPeople = closedPrev.reduce((sum, s) => sum + (s.people || 1), 0);
  const prevAvgTicket = prevTotalPeople > 0 ? prevTotalSales / prevTotalPeople : 0;

  return {
    totalSales,
    totalOrders,
    avgTicket,
    prevTotalSales,
    prevTotalOrders,
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
  const closed = sales.filter((s) => s.saleState === "CLOSED");
  const totalSales = closed.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalOrders = closed.length;
  const totalPeople = closed.reduce((sum, s) => sum + (s.people || 1), 0);
  const avgTicket = totalPeople > 0 ? totalSales / totalPeople : 0;

  // Calcular método de pago principal
  const paymentCounts: Record<string, number> = {};
  closed.forEach((sale) => {
    sale.payments
      .filter((p) => !p.canceled)
      .forEach((p) => {
        const method = p.methodName || "Otro";
        paymentCounts[method] = (paymentCounts[method] || 0) + p.amount;
      });
  });

  const mainPaymentMethod =
    Object.entries(paymentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "Sin datos";

  return {
    sucursalId,
    name,
    color,
    totalSales,
    totalOrders,
    avgTicket,
    mainPaymentMethod,
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
      .filter((s) => s.saleState === "CLOSED")
      .forEach((sale) => {
        const dateStr = sale.closedAt || sale.createdAt;
        if (dateStr) {
          const hour = new Date(dateStr).getHours();
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
    .filter((s) => s.saleState === "CLOSED")
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

function calcTopProducts(
  sales: ParsedSale[],
  limit: number = 10
): TopProduct[] {
  const products: Record<string, { quantity: number; revenue: number }> = {};

  sales
    .filter((s) => s.saleState === "CLOSED")
    .forEach((sale) => {
      sale.items
        .filter((item) => !item.canceled)
        .forEach((item) => {
          const name = item.productName;
          if (!products[name]) {
            products[name] = { quantity: 0, revenue: 0 };
          }
          products[name].quantity += item.quantity || 1;
          products[name].revenue += item.price * item.quantity || 0;
        });
    });

  return Object.entries(products)
    .map(([name, data]) => ({ ...data, name, rank: 0 }))
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

  // Consultar sucursales en paralelo (cada una tiene su propio rate limit queue)
  await Promise.all(
    SUCURSALES.map(async (sucursal) => {
      try {
        const sales = await getSales(sucursal, from, to);
        salesBySucursal[sucursal.id] = sales;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        errors.push(`Error al obtener datos de ${sucursal.name}: ${message}`);
      }

      try {
        const prevSales = await getSales(sucursal, prevFrom, prevTo);
        prevSalesBySucursal[sucursal.id] = prevSales;
      } catch {
        // Error en período anterior no es crítico
      }
    })
  );

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

  return {
    kpis,
    sucursalKPIs,
    hourlySales,
    paymentMethods,
    topProducts,
    errors,
    lastUpdated: new Date().toISOString(),
  };
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
  const closed = sales.filter((s) => s.saleState === "CLOSED");

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
      .filter((s) => s.saleState === "CLOSED")
      .forEach((sale) => {
        const dateStr = sale.createdAt;
        if (dateStr) {
          const hour = new Date(dateStr).getHours();
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
  const closed = sales.filter((s) => s.saleState === "CLOSED");
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
  const closedAll = allSales.filter((s) => s.saleState === "CLOSED");
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

  // Top product concentration (top 5 by revenue)
  const productRevenues: Record<string, number> = {};
  closedAll.forEach((sale) => {
    sale.items.filter((i) => !i.canceled).forEach((item) => {
      const name = item.productName;
      productRevenues[name] = (productRevenues[name] || 0) + item.price * item.quantity;
    });
  });
  const sortedRevenues = Object.values(productRevenues).sort((a, b) => b - a);
  const top5Revenue = sortedRevenues.slice(0, 5).reduce((a, b) => a + b, 0);
  const totalProductRevenue = sortedRevenues.reduce((a, b) => a + b, 0);
  const topProductConcentration = totalProductRevenue > 0 ? (top5Revenue / totalProductRevenue) * 100 : 0;

  // Lunch vs Dinner
  let lunchRevenue = 0, dinnerRevenue = 0, lunchOrders = 0, dinnerOrders = 0;
  closedAll.forEach((sale) => {
    const hour = new Date(sale.createdAt).getHours();
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
        const hour = new Date(sale.createdAt).getHours();
        hourlyRev[hour] = (hourlyRev[hour] || 0) + (sale.total || 0);
      });
    const peak = Object.entries(hourlyRev).sort((a, b) => b[1] - a[1])[0];
    peakHours[s.id] = peak ? { hour: parseInt(peak[0]), revenue: peak[1] } : { hour: 0, revenue: 0 };
  }

  // Revenue heatmap (dayOfWeek x hour)
  const heatmapMap: Record<string, number> = {};
  closedAll.forEach((sale) => {
    const dt = new Date(sale.createdAt);
    const dayOfWeek = dt.getDay(); // 0=Sun
    const hour = dt.getHours();
    const key = `${dayOfWeek}-${hour}`;
    heatmapMap[key] = (heatmapMap[key] || 0) + (sale.total || 0);
  });
  const revenueHeatmap = Object.entries(heatmapMap).map(([key, revenue]) => {
    const [dow, h] = key.split("-").map(Number);
    return { dayOfWeek: dow, hour: h, revenue };
  });

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
    const closed = sales.filter((s) => s.saleState === "CLOSED");

    for (const sale of closed) {
      const hour = new Date(sale.createdAt).getHours();
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

  const closed = sales.filter((s) => s.saleState === "CLOSED");

  for (const sale of closed) {
    const created = sale.createdAt;
    if (!created) continue;

    const dt = new Date(created);
    const monthKey = format(dt, "yyyy-MM");
    const dayKey = format(dt, "yyyy-MM-dd");

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

    const hour = String(dt.getHours());
    m.hourlyRevenue[hour] = (m.hourlyRevenue[hour] || 0) + total;
    m.hourlyCounts[hour] = (m.hourlyCounts[hour] || 0) + 1;

    m.dailyRevenue[dayKey] = (m.dailyRevenue[dayKey] || 0) + total;
    m.dailyOrders[dayKey] = (m.dailyOrders[dayKey] || 0) + 1;
    m.dailyPeople[dayKey] = (m.dailyPeople[dayKey] || 0) + people;

    const wd = String(dt.getDay());
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
