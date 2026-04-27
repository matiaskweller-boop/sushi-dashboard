"use client";

import { useState } from "react";
import preciosData from "../../../data/competencia/precios-2026-03.json";

type RestKey = "masunori" | "gokana" | "paru" | "lima" | "sombra" | "norimoto" | "selvatica" | "osaka" | "muro";
const ALL_REST_KEYS: RestKey[] = ["masunori", "gokana", "paru", "lima", "sombra", "norimoto", "selvatica", "osaka", "muro"];

const restaurants = preciosData.restaurants;
const categories = preciosData.categories as Record<
  string,
  { label: string; unit: string; items: Array<Record<string, unknown>> }
>;

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return "$" + Math.round(n).toLocaleString("es-AR");
}

type SidebarItem = { key: string; label: string };

const SIDEBAR: SidebarItem[] = [
  { key: "overview", label: "Resumen" },
  { key: "nigiris_clasicos", label: "Nigiris Clásicos" },
  { key: "nigiris_autor", label: "Nigiris de Autor" },
  { key: "ceviches", label: "Ceviches" },
  { key: "tiraditos", label: "Tiraditos" },
  { key: "rolls", label: "Rolls" },
  { key: "chirashi", label: "Chirashi" },
  { key: "handrolls", label: "Handrolls" },
  { key: "combos", label: "Combos" },
  { key: "calientes", label: "Platos Calientes" },
  { key: "crispy_rice", label: "Crispy Rice" },
  { key: "tragos", label: "Tragos" },
  { key: "bebidas", label: "Bebidas" },
  { key: "gaps", label: "Oportunidades" },
  { key: "fuentes", label: "Fuentes" },
];

function calcAvgByRestaurant(catKey: string, keys: RestKey[] = ALL_REST_KEYS) {
  const cat = categories[catKey];
  if (!cat) return {};
  const result: Record<string, { avg: number; min: number; max: number; count: number }> = {};
  keys.forEach((k) => {
    const prices = cat.items.map((i) => i[k] as number | null).filter((p): p is number => p !== null && p !== undefined);
    if (prices.length) {
      result[k] = {
        avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        min: Math.min(...prices),
        max: Math.max(...prices),
        count: prices.length,
      };
    }
  });
  return result;
}

function PriceTable({ catKey, keys }: { catKey: string; keys: RestKey[] }) {
  const cat = categories[catKey];
  if (!cat) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="text-left py-2 pr-3 font-medium text-gray-500 text-xs">Producto</th>
            {keys.map((k) => (
              <th
                key={k}
                className={`text-right py-2 px-2 font-medium text-xs whitespace-nowrap ${k === "masunori" ? "bg-amber-50" : ""}`}
                style={{ color: restaurants[k].color }}
              >
                {restaurants[k].name}
              </th>
            ))}
            <th className="text-center py-2 px-2 font-medium text-gray-500 text-xs">Posición</th>
          </tr>
        </thead>
        <tbody>
          {cat.items.map((item, idx) => {
            const allPrices = keys.map((k) => item[k] as number | null).filter((p): p is number => p !== null);
            const compPrices = keys.filter((k) => k !== "masunori")
              .map((k) => item[k] as number | null)
              .filter((p): p is number => p !== null);
            const allMin = allPrices.length ? Math.min(...allPrices) : null;
            const allMax = allPrices.length ? Math.max(...allPrices) : null;
            const masunoriPrice = item.masunori as number | null;

            let position: JSX.Element | null = null;
            if (masunoriPrice && compPrices.length > 0) {
              const compMin = Math.min(...compPrices);
              const compMax = Math.max(...compPrices);
              if (masunoriPrice <= compMin)
                position = <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Más barato</span>;
              else if (masunoriPrice >= compMax)
                position = <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Más caro</span>;
              else position = <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">En rango</span>;
            }

            return (
              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-navy text-sm">{item.item as string}</div>
                  {item.note ? <div className="text-[10px] text-gray-400">{String(item.note)}</div> : null}
                </td>
                {keys.map((k) => {
                  const p = item[k] as number | null;
                  let cellClass = "text-right py-2.5 px-2 tabular-nums text-sm ";
                  if (k === "masunori") cellClass += "bg-amber-50 font-bold ";
                  if (p === null || p === undefined) {
                    return <td key={k} className={cellClass + "text-gray-200"}>-</td>;
                  }
                  if (p === allMin && allPrices.length > 1) cellClass += "text-emerald-600 ";
                  else if (p === allMax && allPrices.length > 1) cellClass += "text-red-500 ";
                  else cellClass += "text-gray-700 ";
                  return <td key={k} className={cellClass}>{fmt(p)}</td>;
                })}
                <td className="text-center py-2.5 px-2">{position}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BarChart({ data }: { data: Array<{ name: string; avg: number; color?: string }> }) {
  const maxVal = Math.max(...data.map((d) => d.avg), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-20 text-xs text-gray-600 text-right truncate">{d.name}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
            <div
              className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
              style={{ width: `${(d.avg / maxVal) * 100}%`, backgroundColor: d.color || "#c8a45e" }}
            >
              <span className="text-[10px] text-white font-bold drop-shadow">{fmt(d.avg)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Overview({ keys }: { keys: RestKey[] }) {
  const mainCats = ["nigiris_clasicos", "nigiris_autor", "ceviches", "tiraditos", "rolls", "chirashi"];

  const catAvgs = mainCats.map((catKey) => {
    const avgs = calcAvgByRestaurant(catKey, keys);
    const allAvgs = Object.values(avgs).map((v) => v.avg);
    return {
      name: categories[catKey]?.label || catKey,
      avg: allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) : 0,
    };
  });

  const nigiriAvgs = calcAvgByRestaurant("nigiris_autor", keys);
  const restBars = Object.entries(nigiriAvgs)
    .map(([k, v]) => ({ name: restaurants[k as RestKey].name, avg: v.avg, color: restaurants[k as RestKey].color }))
    .sort((a, b) => a.avg - b.avg);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-navy">Resumen General</h2>
        <p className="text-sm text-gray-500">Panorama de precios de 6 competidores - Menús reales Marzo 2026</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400">Competidores</div>
          <div className="text-2xl font-bold text-navy">8</div>
          <div className="text-[10px] text-gray-400 mt-1">Gokana, Paru, Lima, Sombra, Norimoto, Selvática, Osaka, Muro</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400">Categorías</div>
          <div className="text-2xl font-bold text-navy">9</div>
          <div className="text-[10px] text-gray-400 mt-1">Nigiris, Rolls, Ceviches, Tiraditos, Chirashi, Combos, Calientes, Crispy</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-400">Fuente</div>
          <div className="text-2xl font-bold text-navy">Menús</div>
          <div className="text-[10px] text-gray-400 mt-1">Precios de salón / take-away (no Rappi)</div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Precio promedio por categoría (todos los restaurants)</h3>
        <BarChart data={catAvgs} />
      </div>

      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Precio promedio por restaurante - Nigiris de Autor x2</h3>
        <BarChart data={restBars} />
      </div>

      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Ticket promedio estimado por persona</h3>
        <BarChart
          data={preciosData.tickets_estimados.map((t) => ({
            name: t.name,
            avg: t.avg,
            color: restaurants[t.name.toLowerCase() as RestKey]?.color || "#999",
          }))}
        />
      </div>

      <div className="card border-l-4 border-l-amber-400">
        <h3 className="font-semibold text-sm mb-3">Ventajas actuales de Masunori</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {preciosData.ventajas.map((v, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
              <span className="text-amber-500 font-bold text-lg leading-none mt-0.5">+</span>
              <div>
                <div className="font-medium text-sm text-navy">{v.item}</div>
                <div className="text-xs text-gray-500">{v.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GapsView() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-navy">Oportunidades</h2>
        <p className="text-sm text-gray-500">Categorías que la competencia ofrece y Masunori podría incorporar</p>
      </div>

      <div className="space-y-3">
        {preciosData.gaps.map((g, i) => (
          <div key={i} className="card border-l-4 border-l-blue-400">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-bold text-navy">{g.category}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.impact.includes("Alto") ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                Impacto: {g.impact}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.difficulty === "Baja" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                Dificultad: {g.difficulty}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-gray-400 text-xs">Quién lo ofrece:</span>
                <div className="text-navy">{g.who}</div>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Rango de precios:</span>
                <div className="text-navy font-medium">{g.range}</div>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Por qué:</span>
                <div className="text-gray-600 text-xs">{g.reason}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card border-l-4 border-l-amber-400">
        <h3 className="font-semibold text-sm mb-3">Ventajas actuales de Masunori</h3>
        <div className="space-y-2">
          {preciosData.ventajas.map((v, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-amber-500 font-bold">+</span>
              <div>
                <span className="font-medium text-sm text-navy">{v.item}</span>
                <span className="text-xs text-gray-500 ml-2">{v.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryView({ catKey, keys }: { catKey: string; keys: RestKey[] }) {
  const cat = categories[catKey];
  if (!cat) return null;

  const avgs = calcAvgByRestaurant(catKey, keys);
  const restBars = Object.entries(avgs)
    .map(([k, v]) => ({ name: restaurants[k as RestKey].name, avg: v.avg, color: restaurants[k as RestKey].color }))
    .sort((a, b) => a.avg - b.avg);

  const masunoriAvg = avgs.masunori;
  const compAvgs = Object.entries(avgs)
    .filter(([k]) => k !== "masunori")
    .map(([, v]) => v.avg);
  const marketAvg = compAvgs.length ? Math.round(compAvgs.reduce((a, b) => a + b, 0) / compAvgs.length) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-navy">{cat.label}</h2>
        <p className="text-sm text-gray-500">{cat.unit}</p>
      </div>

      {masunoriAvg && marketAvg && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <div className="text-[10px] text-amber-600 uppercase font-medium">Masunori prom.</div>
            <div className="text-lg font-bold text-navy">{fmt(masunoriAvg.avg)}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Mercado prom.</div>
            <div className="text-lg font-bold text-navy">{fmt(marketAvg)}</div>
          </div>
          <div className={`border rounded-xl p-3 text-center ${masunoriAvg.avg > marketAvg ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
            <div className="text-[10px] text-gray-500 uppercase font-medium">vs Mercado</div>
            <div className={`text-lg font-bold ${masunoriAvg.avg > marketAvg ? "text-red-600" : "text-emerald-600"}`}>
              {masunoriAvg.avg > marketAvg ? "+" : ""}{Math.round(((masunoriAvg.avg - marketAvg) / marketAvg) * 100)}%
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Ranking por precio promedio</h3>
        <BarChart data={restBars} />
      </div>

      <div className="card">
        <h3 className="font-semibold text-sm mb-3">Comparativa de precios</h3>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-3 text-xs text-blue-700">
          Verde = más barato de la fila | Rojo = más caro
        </div>
        <PriceTable catKey={catKey} keys={keys} />
      </div>
    </div>
  );
}

export default function CompetenciaPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const COMP_KEYS = ALL_REST_KEYS.filter((k) => k !== "masunori");
  const [enabledComps, setEnabledComps] = useState<Set<string>>(new Set(COMP_KEYS));

  const toggleComp = (key: string) => {
    setEnabledComps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeKeys: RestKey[] = ["masunori", ...COMP_KEYS.filter((k) => enabledComps.has(k))] as RestKey[];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex gap-6">
        {/* Sidebar desktop */}
        <div className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-4 space-y-1">
            <h3 className="text-xs text-gray-400 uppercase font-medium mb-2 px-3">Categorías</h3>
            {SIDEBAR.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === item.key ? "bg-amber-100 text-amber-800 font-medium" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile category selector */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 overflow-x-auto">
          <div className="flex gap-1 p-2">
            {SIDEBAR.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveSection(item.key)}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                  activeSection === item.key ? "bg-amber-100 text-amber-800 font-medium" : "text-gray-500 bg-gray-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 pb-16 lg:pb-0">
          {/* Restaurant toggles */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs text-gray-400 self-center mr-1">Comparar con:</span>
            {COMP_KEYS.map((k) => {
              const r = restaurants[k as keyof typeof restaurants];
              const enabled = enabledComps.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleComp(k)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    enabled
                      ? "text-white border-transparent"
                      : "bg-white text-gray-400 border-gray-200 line-through"
                  }`}
                  style={enabled ? { backgroundColor: r.color, borderColor: r.color } : {}}
                >
                  {r.name}
                </button>
              );
            })}
          </div>

          {activeSection === "overview" && <Overview keys={activeKeys} />}
          {activeSection === "gaps" && <GapsView />}
          {activeSection === "fuentes" && <FuentesView />}
          {Object.keys(categories).includes(activeSection) && <CategoryView catKey={activeSection} keys={activeKeys} />}
        </div>
      </div>
    </div>
  );
}

// ===== Fuentes (Menu Sources) =====
const menuSources = (preciosData as Record<string, unknown>).menuSources as Record<string, { url: string | null; label: string }> | undefined;

function FuentesView() {
  const sources = menuSources || {};
  const entries = Object.entries(sources).filter(([key]) => key !== "masunori");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-navy">Fuentes de precios</h2>
      <p className="text-sm text-gray-500">
        Links a los menus online de cada competidor. Desde aca podes verificar los precios y pedir actualizaciones.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entries.map(([key, src]) => {
          const rest = restaurants[key as RestKey];
          const color = rest?.color || "#666";
          return (
            <div
              key={key}
              className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:shadow-sm transition-shadow"
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-navy text-sm">{rest?.name || key}</p>
                <p className="text-xs text-gray-400 truncate">{src.label}</p>
              </div>
              {src.url ? (
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium whitespace-nowrap"
                >
                  Ver menu &rarr;
                </a>
              ) : (
                <span className="text-xs px-3 py-1.5 bg-gray-50 text-gray-400 rounded-lg whitespace-nowrap">
                  Sin link
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Update prices button */}
      <UpdatePricesButton sources={entries} />

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 mt-4">
        <p className="font-medium mb-1">Para actualizar precios</p>
        <p className="text-amber-600">
          Si un link falta o esta desactualizado, completa el link en el dashboard o pedime que entre
          y lo actualice. Los menus se guardan en <code className="bg-amber-100 px-1 rounded">data/competencia/menus/</code>.
        </p>
      </div>
    </div>
  );
}

function UpdatePricesButton({ sources }: { sources: [string, { url: string | null; label: string }][] }) {
  const [copied, setCopied] = useState(false);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    new Set(sources.filter(([, s]) => s.url).map(([k]) => k))
  );

  const toggleSource = (key: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const generatePrompt = () => {
    const selected = sources.filter(([k]) => selectedSources.has(k));
    const lines = selected.map(([k, s]) => {
      const rest = restaurants[k as RestKey];
      return `- ${rest?.name || k}: ${s.url || "sin link"}`;
    });

    return `Actualiza los precios de competencia del dashboard Masunori. Entra a cada uno de estos menus online, lee los precios (siempre FULL PRICE, sin descuento), guarda los archivos de menu y actualiza el JSON de comparativa:\n\n${lines.join("\n")}\n\nUsa los precios sin descuento (full price). Guarda cada menu en data/competencia/menus/ y actualiza data/competencia/precios-2026-03.json. Despues hace build y deploy.`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatePrompt()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 mt-4">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl">🔄</span>
        <div>
          <h3 className="font-bold text-navy text-sm">Actualizar precios de competencia</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Selecciona los competidores y copia el prompt para pedirle a Claude que actualice los precios.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {sources.map(([key, src]) => {
          const rest = restaurants[key as RestKey];
          const selected = selectedSources.has(key);
          const hasUrl = !!src.url;
          return (
            <button
              key={key}
              onClick={() => hasUrl && toggleSource(key)}
              disabled={!hasUrl}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                !hasUrl
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                  : selected
                  ? "text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-500 hover:border-blue-300"
              }`}
              style={selected && hasUrl ? { backgroundColor: rest?.color || "#666" } : undefined}
            >
              {rest?.name || key}
              {!hasUrl && " (sin link)"}
            </button>
          );
        })}
      </div>

      <button
        onClick={handleCopy}
        disabled={selectedSources.size === 0}
        className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all ${
          copied
            ? "bg-emerald-500 text-white"
            : selectedSources.size === 0
            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-blue-accent text-white hover:bg-blue-700 shadow-sm"
        }`}
      >
        {copied
          ? "✓ Prompt copiado — pegalo en Claude"
          : `Copiar prompt para actualizar ${selectedSources.size} menu${selectedSources.size !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
