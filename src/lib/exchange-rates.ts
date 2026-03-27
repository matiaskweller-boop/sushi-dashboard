// ===== Exchange Rate Service (Dolar Blue) =====

interface BluelyticsLatest {
  blue: {
    value_avg: number;
    value_sell: number;
    value_buy: number;
  };
  oficial: {
    value_avg: number;
    value_sell: number;
    value_buy: number;
  };
}

interface BluelyticsEvolution {
  date: string;
  source: string;
  value_sell: number;
  value_buy: number;
}

// In-memory cache
let currentRateCache: { rate: number; expiresAt: number } | null = null;
let historicalCache: { data: BluelyticsEvolution[]; expiresAt: number } | null = null;

const CURRENT_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const HISTORICAL_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function getCurrentBlueRate(): Promise<number | null> {
  if (currentRateCache && currentRateCache.expiresAt > Date.now()) {
    return currentRateCache.rate;
  }

  try {
    const res = await fetch("https://api.bluelytics.com.ar/v2/latest", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data: BluelyticsLatest = await res.json();
    const rate = data.blue.value_sell;
    currentRateCache = { rate, expiresAt: Date.now() + CURRENT_CACHE_TTL };
    return rate;
  } catch {
    return null;
  }
}

export async function getHistoricalBlueRates(): Promise<BluelyticsEvolution[]> {
  if (historicalCache && historicalCache.expiresAt > Date.now()) {
    return historicalCache.data;
  }

  try {
    const res = await fetch(
      "https://api.bluelytics.com.ar/v2/evolution.json?limit=730",
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data: BluelyticsEvolution[] = await res.json();
    // Filter only blue rates
    const blueRates = data.filter((d) => d.source === "Blue");
    historicalCache = { data: blueRates, expiresAt: Date.now() + HISTORICAL_CACHE_TTL };
    return blueRates;
  } catch {
    return [];
  }
}

export function calcMonthlyAverages(
  rates: BluelyticsEvolution[]
): Record<string, number> {
  const monthlyTotals: Record<string, { sum: number; count: number }> = {};

  for (const entry of rates) {
    const date = entry.date.substring(0, 7); // "YYYY-MM"
    if (!monthlyTotals[date]) {
      monthlyTotals[date] = { sum: 0, count: 0 };
    }
    monthlyTotals[date].sum += entry.value_sell;
    monthlyTotals[date].count += 1;
  }

  const result: Record<string, number> = {};
  for (const [month, { sum, count }] of Object.entries(monthlyTotals)) {
    result[month] = Math.round(sum / count);
  }
  return result;
}
