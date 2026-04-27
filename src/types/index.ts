// ===== Fudo JSON:API Raw Types =====

export interface JsonApiResource<T = Record<string, unknown>> {
  type: string;
  id: string;
  attributes: T;
  relationships?: Record<string, {
    data: JsonApiRef | JsonApiRef[] | null;
  }>;
}

export interface JsonApiRef {
  type: string;
  id: string;
}

export interface JsonApiResponse<T = Record<string, unknown>> {
  data: JsonApiResource<T>[];
  included?: JsonApiResource[];
}

// ===== Fudo Attribute Types =====

export interface FudoSaleAttributes {
  closedAt: string | null;
  createdAt: string;
  total: number;
  people: number | null;
  customerName: string | null;
  comment: string | null;
  saleType: string; // "EAT-IN", "TAKE-AWAY", etc.
  saleState: string; // "CLOSED", "OPEN", etc.
  expectedPayments: unknown;
  anonymousCustomer: unknown;
}

export interface FudoItemAttributes {
  canceled: boolean | null;
  cancellationComment: string | null;
  comment: string | null;
  createdAt: string;
  price: number;
  quantity: number;
  status: string;
  paid: boolean | null;
}

export interface FudoPaymentAttributes {
  amount: number;
  canceled: boolean | null;
  createdAt: string;
  externalReference: string | null;
}

export interface FudoPaymentMethodAttributes {
  name: string;
  active: boolean;
  code: string;
  position: number;
}

export interface FudoProductAttributes {
  active: boolean;
  code: string | null;
  name: string;
  description: string | null;
  price: number;
  sellAlone: boolean;
  favourite: boolean;
  position: number;
  stock: number | null;
  stockControl: boolean;
  cost: number | null;
}

export interface FudoCategoryAttributes {
  name: string;
  position: number;
}

// ===== Parsed/Normalized Types =====

export interface ParsedSale {
  id: string;
  closedAt: string | null;
  createdAt: string;
  total: number;
  people: number;
  saleType: string;
  saleState: string;
  items: ParsedItem[];
  payments: ParsedPayment[];
  tableId: string | null;
}

export interface ParsedCategory {
  id: string;
  name: string;
  position: number;
}

export interface ParsedItem {
  id: string;
  productId: string;
  productName: string; // se resuelve contra products
  price: number;
  quantity: number;
  canceled: boolean;
  categoryId: string | null;
  categoryName: string | null;
}

export interface ParsedPayment {
  id: string;
  amount: number;
  canceled: boolean;
  methodId: string;
  methodName: string; // se resuelve contra included PaymentMethod
}

export interface ParsedProduct {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  active: boolean;
  code: string | null;
  stock: number | null;
  stockControl: boolean;
  cost: number | null;
}

// ===== App Types =====

export type SucursalId = "palermo" | "belgrano" | "puerto";

export interface SucursalConfig {
  id: SucursalId;
  name: string;
  fullName: string;
  color: string;
  apiKey: string;
  apiSecret: string;
}

export interface SalesData {
  sucursalId: SucursalId;
  sales: ParsedSale[];
  error?: string;
}

export interface KPIs {
  totalSales: number;
  totalOrders: number;
  totalPax: number;
  avgTicket: number;
  avgTicketLunch: number;
  avgTicketDinner: number;
  prevTotalSales: number;
  prevTotalOrders: number;
  prevTotalPax: number;
  prevAvgTicket: number;
}

export interface PaymentBreakdown {
  method: string;
  amount: number;
  percentage: number;
}

export interface SucursalKPIs {
  sucursalId: SucursalId;
  name: string;
  color: string;
  totalSales: number;
  totalOrders: number;
  totalPax: number;
  avgTicket: number;
  avgTicketLunch: number;
  avgTicketDinner: number;
  lunchRevenue: number;
  dinnerRevenue: number;
  lunchPct: number;
  dinnerPct: number;
  mainPaymentMethod: string;
  paymentBreakdown: PaymentBreakdown[];
  error?: string;
}

export interface HourlySalesData {
  hour: number;
  palermo: number;
  belgrano: number;
  puerto: number;
}

export interface PaymentMethodData {
  method: string;
  amount: number;
  percentage: number;
}

export interface TopProduct {
  rank: number;
  name: string;
  quantity: number;
  revenue: number;
}

export interface DashboardData {
  kpis: KPIs;
  sucursalKPIs: SucursalKPIs[];
  hourlySales: HourlySalesData[];
  paymentMethods: PaymentMethodData[];
  topProducts: {
    all: TopProduct[];
    palermo: TopProduct[];
    belgrano: TopProduct[];
    puerto: TopProduct[];
  };
  errors: string[];
  lastUpdated: string;
}

export type PeriodFilter = "today" | "yesterday" | "7days" | "30days" | "custom";

// ===== Advanced KPIs Types =====

export interface AdvancedKPIsSucursal {
  sucursalId: SucursalId;
  name: string;
  color: string;
  avgDurationMinutes: number;
  avgPeoplePerOrder: number;
  revpash: number;
  avgItemsPerOrder: number;
}

export interface AdvancedKPIsData {
  global: {
    avgDurationMinutes: number;
    avgPeoplePerOrder: number;
    revpash: number;
    avgItemsPerOrder: number;
  };
  bySucursal: AdvancedKPIsSucursal[];
  hourlyOrderCounts: HourlySalesData[]; // reusing shape: hour, palermo, belgrano, puerto (but counts not revenue)
  canceledItemsRate: number;
  totalItems: number;
  canceledItems: number;
  peopleDistribution: { people: string; count: number }[];
  itemsPerPerson: number;
  revenuePerMinute: number;
  topProductConcentration: number;
  topProducts: { name: string; revenue: number; quantity: number; percentage: number }[];
  // New growth KPIs
  growthVsSameWeekday: number | null; // % change vs same weekday last week
  revenuePerPerson: number; // revenue / total people
  estimatedOccupancy: number; // estimated seat occupancy rate %
  lunchRevenue: number;
  dinnerRevenue: number;
  lunchOrders: number;
  dinnerOrders: number;
  peakHours: Record<string, { hour: number; revenue: number }>;
  revenueHeatmap: { dayOfWeek: number; hour: number; revenue: number }[];
  errors: string[];
  lastUpdated: string;
}

// ===== Product Analytics Types =====

export interface CategoryAnalytics {
  categoryName: string;
  revenue: number;
  quantity: number;
  bySucursal: Record<SucursalId, { revenue: number; quantity: number }>;
}

export interface TimeSlotAnalytics {
  slot: string;
  revenue: number;
  orders: number;
  starProduct: string | null;
  starProductRevenue: number;
}

export interface ProductAnalyticsData {
  categories: CategoryAnalytics[];
  timeSlots: TimeSlotAnalytics[];
  bySucursal: Record<SucursalId, CategoryAnalytics[]>;
  errors: string[];
  lastUpdated: string;
}

// ===== Consumption Tracking Types =====

export interface ConsumptionProduct {
  name: string;
  categoryName: string;
  totalQuantity: number;
  monthlyData: Record<string, number>; // "YYYY-MM" -> quantity
  bySucursal: Record<SucursalId, number>;
  trend: number; // % change last month vs avg of previous months
}

export interface CategoryConsumption {
  categoryName: string;
  totalQuantity: number;
  monthlyData: Record<string, number>;
}

export interface LowMovementProduct {
  name: string;
  categoryName: string;
  totalQuantity: number;
  lastSoldMonth: string | null; // last month with sales, null if never
  monthsWithoutSales: number; // consecutive months without sales from the end
}

export interface ConsumptionData {
  products: ConsumptionProduct[];
  categories: CategoryConsumption[];
  lowMovement: LowMovementProduct[]; // products with declining/no sales
  months: string[]; // sorted list of "YYYY-MM" strings
  errors: string[];
  lastUpdated: string;
}
