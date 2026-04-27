"use client";

import { useState, useEffect, useCallback } from "react";

interface ProductBySucursal {
  id: string;
  name: string;
  price: number;
  active: boolean;
  stock: number | null;
  stockControl: boolean;
  category: string;
  rawCategory: string;
}

interface MergedProduct {
  normalizedKey: string;
  canonicalName: string;
  category: string;
  hasInconsistentNames: boolean;
  sucursales: Record<string, ProductBySucursal>;
}

interface ManageData {
  products: MergedProduct[];
  totalProducts: number;
  inconsistentCount: number;
  lastUpdated: string;
}

const SUC_NAMES: Record<string, string> = {
  palermo: "Palermo",
  belgrano: "Belgrano",
  puerto: "Puerto Madero",
};
const SUC_COLORS: Record<string, string> = {
  palermo: "#2E6DA4",
  belgrano: "#10B981",
  puerto: "#8B5CF6",
};
const ALL_SUC = ["palermo", "belgrano", "puerto"];

function fmt(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

export default function StockPage() {
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockOnly, setStockOnly] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/fudo/products/manage");
      if (!res.ok) throw new Error("Error cargando productos");
      const json: ManageData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400 text-lg">Cargando productos...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 text-red-700 rounded-xl p-4">{error || "Sin datos"}</div>
      </div>
    );
  }

  // Get categories
  const categories = Array.from(new Set(data.products.map((p) => p.category))).sort();

  // Filter products
  const filtered = data.products.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.canonicalName.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) return false;
    }
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (stockOnly) {
      const hasStock = Object.values(p.sucursales).some((s) => s.stockControl);
      if (!hasStock) return false;
    }
    if (activeOnly) {
      const hasActive = Object.values(p.sucursales).some((s) => s.active);
      if (!hasActive) return false;
    }
    return true;
  });

  // Stats
  const totalWithStock = data.products.filter((p) =>
    Object.values(p.sucursales).some((s) => s.stockControl)
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">Productos & Stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data.totalProducts} productos · {totalWithStock} con control de stock
          </p>
        </div>
        <div className="text-xs text-gray-400">
          Actualizado: {new Date(data.lastUpdated).toLocaleTimeString("es-AR")}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-2xl font-bold text-navy">{data.totalProducts}</div>
          <div className="text-xs text-gray-500 mt-1">Total productos</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-2xl font-bold text-emerald-600">{totalWithStock}</div>
          <div className="text-xs text-gray-500 mt-1">Con stock control</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-2xl font-bold text-amber-600">{data.inconsistentCount}</div>
          <div className="text-xs text-gray-500 mt-1">Nombres inconsistentes</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-2xl font-bold text-purple-600">{categories.length}</div>
          <div className="text-xs text-gray-500 mt-1">Categorías</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-blue-accent"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-accent"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={stockOnly}
              onChange={(e) => setStockOnly(e.target.checked)}
              className="rounded"
            />
            Solo con stock
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded"
            />
            Solo activos
          </label>
          <span className="text-xs text-gray-400">{filtered.length} resultados</span>
        </div>
      </div>

      {/* Product list */}
      <div className="space-y-2">
        {filtered.map((product) => (
          <ProductCard key={product.normalizedKey} product={product} />
        ))}
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: MergedProduct }) {
  const [expanded, setExpanded] = useState(false);
  const sucEntries = ALL_SUC.map((id) => ({
    id,
    data: product.sucursales[id] || null,
  }));
  const prices = sucEntries.filter((s) => s.data).map((s) => s.data!.price);
  const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
  const hasStock = sucEntries.some((s) => s.data?.stockControl);
  const allActive = sucEntries.every((s) => !s.data || s.data.active);

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status dot */}
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            allActive ? "bg-emerald-400" : "bg-gray-300"
          }`}
        />

        {/* Name + category */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-navy text-sm truncate">
              {product.canonicalName}
            </span>
            {product.hasInconsistentNames && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full flex-shrink-0">
                nombre inconsistente
              </span>
            )}
            {hasStock && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full flex-shrink-0">
                stock
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{product.category}</span>
        </div>

        {/* Price */}
        <div className="text-sm font-semibold text-navy">{fmt(avgPrice)}</div>

        {/* Sucursal dots */}
        <div className="flex gap-1">
          {ALL_SUC.map((id) => (
            <div
              key={id}
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: product.sucursales[id]
                  ? product.sucursales[id].active
                    ? SUC_COLORS[id]
                    : "#d1d5db"
                  : "transparent",
                border: product.sucursales[id] ? "none" : "1px dashed #d1d5db",
              }}
              title={
                product.sucursales[id]
                  ? `${SUC_NAMES[id]}: ${product.sucursales[id].active ? "activo" : "inactivo"}`
                  : `${SUC_NAMES[id]}: no existe`
              }
            />
          ))}
        </div>

        {/* Expand arrow */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-50">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {sucEntries.map(({ id, data }) => (
              <div
                key={id}
                className={`rounded-lg p-3 ${data ? "bg-gray-50" : "bg-gray-50/50"}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: data?.active ? SUC_COLORS[id] : "#d1d5db" }}
                  />
                  <span className="text-xs font-medium text-gray-700">{SUC_NAMES[id]}</span>
                  {data && !data.active && (
                    <span className="text-[9px] px-1 py-0.5 bg-gray-200 text-gray-500 rounded">
                      inactivo
                    </span>
                  )}
                  {!data && (
                    <span className="text-[9px] px-1 py-0.5 bg-gray-200 text-gray-500 rounded">
                      no existe
                    </span>
                  )}
                </div>
                {data ? (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">Precio</span>
                      <span className="text-sm font-semibold">{fmt(data.price)}</span>
                    </div>
                    {data.stockControl && (
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">Stock</span>
                        <span className={`text-sm font-semibold ${(data.stock || 0) <= 5 ? "text-red-500" : "text-emerald-600"}`}>
                          {data.stock ?? "—"}
                        </span>
                      </div>
                    )}
                    {data.name !== product.canonicalName && (
                      <div className="text-[10px] text-amber-500 mt-1">
                        Nombre local: &quot;{data.name}&quot;
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic">Sin producto</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
