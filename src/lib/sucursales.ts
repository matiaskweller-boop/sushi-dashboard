import { SucursalConfig, SucursalId } from "@/types";

export const SUCURSALES: SucursalConfig[] = [
  {
    id: "palermo",
    name: "Palermo",
    fullName: "Masunori Palermo",
    color: "#2E6DA4",
    apiKey: process.env.FUDO_PALERMO_API_KEY || "",
    apiSecret: process.env.FUDO_PALERMO_API_SECRET || "",
  },
  {
    id: "belgrano",
    name: "Belgrano",
    fullName: "Masunori Belgrano",
    color: "#10B981",
    apiKey: process.env.FUDO_BELGRANO_API_KEY || "",
    apiSecret: process.env.FUDO_BELGRANO_API_SECRET || "",
  },
  {
    id: "puerto",
    name: "Puerto Madero",
    fullName: "Masunori Puerto Madero",
    color: "#8B5CF6",
    apiKey: process.env.FUDO_PUERTO_API_KEY || "",
    apiSecret: process.env.FUDO_PUERTO_API_SECRET || "",
  },
];

export function getSucursal(id: SucursalId): SucursalConfig | undefined {
  return SUCURSALES.find((s) => s.id === id);
}

export function getSucursalColor(id: SucursalId): string {
  return getSucursal(id)?.color || "#6B7280";
}
