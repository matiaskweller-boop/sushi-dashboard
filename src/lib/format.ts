export function formatMoney(
  amount: number,
  currency: "ARS" | "USD" = "ARS",
  rate?: number
): string {
  const value = currency === "USD" && rate ? amount / rate : amount;
  const curr = currency === "USD" ? "USD" : "ARS";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: curr,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMoneyShort(
  amount: number,
  currency: "ARS" | "USD" = "ARS",
  rate?: number
): string {
  const value = currency === "USD" && rate ? amount / rate : amount;
  const prefix = currency === "USD" ? "US$" : "$";
  if (value >= 1000000) return `${prefix}${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${prefix}${(value / 1000).toFixed(0)}K`;
  return `${prefix}${value.toFixed(0)}`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("es-AR").format(num);
}
