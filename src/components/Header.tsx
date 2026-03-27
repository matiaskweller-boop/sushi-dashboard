"use client";

import { useRouter } from "next/navigation";
import { useCurrency } from "@/lib/CurrencyContext";

interface HeaderProps {
  connectedCount: number;
  errors: string[];
}

export default function Header({ connectedCount, errors }: HeaderProps) {
  const router = useRouter();
  const { currency, toggleCurrency, rates } = useCurrency();

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  const totalSucursales = 3;
  const hasErrors = errors.length > 0;

  return (
    <header className="bg-navy text-white">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="font-japanese text-2xl md:text-3xl font-bold tracking-wider">
              MASUNORI
            </h1>
            <p className="text-blue-300 text-xs tracking-widest uppercase">
              Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                hasErrors ? "bg-yellow-400" : "bg-green-400"
              }`}
            />
            <span className="text-blue-200">
              {connectedCount}/{totalSucursales} sucursales conectadas
            </span>
          </div>

          {/* ARS/USD toggle */}
          {rates && (
            <button
              onClick={toggleCurrency}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors bg-white/10 hover:bg-white/20"
              title={`Dolar Blue: $${rates.current}`}
            >
              <span className={currency === "ARS" ? "text-white" : "text-blue-300"}>
                ARS
              </span>
              <span className="text-blue-400">/</span>
              <span className={currency === "USD" ? "text-white" : "text-blue-300"}>
                USD
              </span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="text-blue-300 hover:text-white text-sm transition-colors"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
