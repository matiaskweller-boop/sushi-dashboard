"use client";

import { useState, useEffect, useCallback } from "react";
import staticMenuData from "../../../data/menu/masunori-menu.json";
import { getNormalizedKey } from "@/lib/product-aliases";

// ===== Types =====

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description?: string;
  tag?: string;
  fudoMatch?: string;
}

interface MenuSection {
  id: string;
  title: string;
  subtitle?: string;
  items: MenuItem[];
}

interface MenuPage {
  id: string;
  title: string;
  sections: MenuSection[];
}

interface FudoProductBySucursal {
  id: string;
  name: string;
  price: number;
  active: boolean;
  stock: number | null;
  stockControl: boolean;
  category: string;
  rawCategory: string;
}

interface FudoMergedProduct {
  normalizedKey: string;
  canonicalName: string;
  category: string;
  hasInconsistentNames: boolean;
  sucursales: Record<string, FudoProductBySucursal>;
}

interface FudoManageData {
  products: FudoMergedProduct[];
  totalProducts: number;
  inconsistentCount: number;
  lastUpdated: string;
}

// ===== Constants =====

const SUCURSAL_NAMES: Record<string, string> = {
  palermo: "Palermo",
  belgrano: "Belgrano",
  puerto: "Madero",
};

const ALL_SUCURSALES = ["palermo", "belgrano", "puerto"];

const staticPages: MenuPage[] = staticMenuData.pages as MenuPage[];

// ===== Helpers =====

function fmtPrice(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

function buildFudoLookup(
  products: FudoMergedProduct[]
): Map<string, FudoMergedProduct> {
  const map = new Map<string, FudoMergedProduct>();
  for (const p of products) {
    map.set(p.normalizedKey, p);
  }
  return map;
}

function findFudoMatch(
  item: MenuItem,
  lookup: Map<string, FudoMergedProduct>
): FudoMergedProduct | null {
  const key = getNormalizedKey(item.fudoMatch || item.name);
  return lookup.get(key) || null;
}

function getFudoAvgPrice(product: FudoMergedProduct): number {
  const prices = Object.values(product.sucursales).map((s) => s.price);
  if (prices.length === 0) return 0;
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
}

// ===== Sub-components =====

function DotLeader() {
  return (
    <span
      className="flex-1 mx-2 border-b border-dotted border-menu-gold-light min-w-[2rem]"
      aria-hidden="true"
    />
  );
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-block text-[10px] tracking-wide uppercase px-2 py-0.5 rounded-full border border-menu-gold-light text-menu-gold bg-white/60 whitespace-nowrap">
      {tag}
    </span>
  );
}

function FudoBadge({
  item,
  fudoProduct,
}: {
  item: MenuItem;
  fudoProduct: FudoMergedProduct | null;
}) {
  if (!fudoProduct) {
    return <span className="text-[10px] text-gray-400 ml-2">sin match</span>;
  }

  const avgFudoPrice = getFudoAvgPrice(fudoProduct);
  const diff = Math.abs(avgFudoPrice - item.price);

  if (diff <= 100) {
    return (
      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 ml-2">
        &#10003; Fudo
      </span>
    );
  }

  return (
    <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 ml-2">
      Fudo: {fmtPrice(avgFudoPrice)}
    </span>
  );
}

function FudoSucursalDetail({
  fudoProduct,
}: {
  fudoProduct: FudoMergedProduct | null;
}) {
  if (!fudoProduct) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 mt-1">
      {ALL_SUCURSALES.map((sid) => {
        const s = fudoProduct.sucursales[sid];
        if (!s) return null;
        return (
          <span key={sid}>
            {SUCURSAL_NAMES[sid]}:{" "}
            <span className="font-medium text-menu-text">
              {fmtPrice(s.price)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function EditPanel({
  item,
  fudoProduct,
  editName,
  editPrice,
  editDesc,
  editTag,
  setEditName,
  setEditPrice,
  setEditDesc,
  setEditTag,
  onSave,
  onCancel,
  onDelete,
  saving,
}: {
  item: MenuItem;
  fudoProduct: FudoMergedProduct | null;
  editName: string;
  editPrice: string;
  editDesc: string;
  editTag: string;
  setEditName: (v: string) => void;
  setEditPrice: (v: string) => void;
  setEditDesc: (v: string) => void;
  setEditTag: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-white border border-menu-gold-light rounded-lg p-4 mt-2 mb-3 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">
            Nombre
          </label>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-menu-text focus:outline-none focus:border-menu-gold focus:ring-1 focus:ring-menu-gold-light"
          />
        </div>
        <div>
          <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">
            Precio
          </label>
          <input
            type="number"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-menu-text focus:outline-none focus:border-menu-gold focus:ring-1 focus:ring-menu-gold-light"
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">
          Descripcion
        </label>
        <input
          type="text"
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Ingredientes, detalle..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-menu-text focus:outline-none focus:border-menu-gold focus:ring-1 focus:ring-menu-gold-light"
        />
      </div>

      <div className="mb-3">
        <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">
          Etiqueta / Badge <span className="normal-case text-gray-400">— sale al lado del nombre</span>
        </label>
        <input
          type="text"
          value={editTag}
          onChange={(e) => setEditTag(e.target.value)}
          placeholder='ej "THE CHEESECAKE FACTORY" o "EXCLUSIVO PUERTO MADERO"'
          maxLength={50}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-menu-text uppercase tracking-wide focus:outline-none focus:border-menu-gold focus:ring-1 focus:ring-menu-gold-light"
        />
        {/* Atajos rapidos */}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <button type="button" onClick={() => setEditTag("")}
            className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200">
            sin etiqueta
          </button>
          {[
            "THE CHEESECAKE FACTORY",
            "EXCLUSIVO PUERTO MADERO",
            "EXCLUSIVO PALERMO",
            "EXCLUSIVO BELGRANO",
            "NUEVO",
            "TEMPORADA",
            "CHEF'S CHOICE",
          ].map((preset) => (
            <button key={preset} type="button" onClick={() => setEditTag(preset)}
              className="text-[10px] px-2 py-0.5 rounded border border-menu-gold-light text-menu-gold hover:bg-menu-gold-light/30">
              {preset}
            </button>
          ))}
        </div>
        {/* Preview */}
        {editTag.trim() && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-gray-400 uppercase">Preview:</span>
            <span className="text-menu-text text-[14px]">{editName || item.name}</span>
            <TagBadge tag={editTag.trim()} />
          </div>
        )}
      </div>

      {fudoProduct && (
        <div className="bg-gray-50 rounded-lg p-3 mb-3">
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">
            Precios Fudo por sucursal (referencia)
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {ALL_SUCURSALES.map((sid) => {
              const s = fudoProduct.sucursales[sid];
              if (!s) return null;
              return (
                <span key={sid} className="text-sm text-menu-text">
                  <span className="text-gray-400">{SUCURSAL_NAMES[sid]}:</span>{" "}
                  <span className="font-medium">{fmtPrice(s.price)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {item.fudoMatch && !fudoProduct && (
        <div className="bg-amber-50 rounded-lg p-2 mb-3 text-xs text-amber-700">
          Linkeado a &quot;{item.fudoMatch}&quot; pero no se encontro en Fudo
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
            saving
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-menu-gold text-white hover:bg-menu-gold/90"
          }`}
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-menu-text hover:bg-gray-100 transition-colors min-h-[44px]"
        >
          Cancelar
        </button>
        <button
          onClick={() => { if (confirm(`Eliminar "${item.name}" del menu?`)) onDelete(); }}
          className="ml-auto px-3 py-2 rounded-lg text-xs text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors min-h-[44px]"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

function MenuItemRow({
  item,
  fudoProduct,
  editMode,
  showFudoPrices,
  isEditing,
  editName,
  editPrice,
  editDesc,
  editTag,
  setEditName,
  setEditPrice,
  setEditDesc,
  setEditTag,
  onClickItem,
  onSave,
  onCancel,
  onDelete,
  saving,
}: {
  item: MenuItem;
  fudoProduct: FudoMergedProduct | null;
  editMode: boolean;
  showFudoPrices: boolean;
  isEditing: boolean;
  editName: string;
  editPrice: string;
  editDesc: string;
  editTag: string;
  setEditName: (v: string) => void;
  setEditPrice: (v: string) => void;
  setEditDesc: (v: string) => void;
  setEditTag: (v: string) => void;
  onClickItem: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  return (
    <div>
      <div
        className={`flex items-baseline py-2 ${
          editMode
            ? "cursor-pointer hover:bg-menu-gold-light/20 rounded-lg px-2 -mx-2 transition-colors"
            : ""
        }`}
        onClick={editMode ? onClickItem : undefined}
        role={editMode ? "button" : undefined}
        tabIndex={editMode ? 0 : undefined}
        onKeyDown={
          editMode
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") onClickItem();
              }
            : undefined
        }
      >
        <div className="flex-shrink-0 min-w-0">
          <span className="text-menu-text text-[15px]">{item.name}</span>
          {item.tag && (
            <span className="ml-2">
              <TagBadge tag={item.tag} />
            </span>
          )}
        </div>
        <DotLeader />
        <div className="flex-shrink-0 flex items-center">
          <span className="text-menu-text font-medium tabular-nums text-[15px]">
            {fmtPrice(item.price)}
          </span>
          {showFudoPrices && (
            <FudoBadge item={item} fudoProduct={fudoProduct} />
          )}
        </div>
      </div>

      {item.description && (
        <p className="text-[12px] text-gray-400 -mt-0.5 mb-1 leading-relaxed pl-0.5">
          {item.description}
        </p>
      )}

      {showFudoPrices && fudoProduct && !isEditing && (
        <FudoSucursalDetail fudoProduct={fudoProduct} />
      )}

      {isEditing && (
        <EditPanel
          item={item}
          fudoProduct={fudoProduct}
          editName={editName}
          editPrice={editPrice}
          editDesc={editDesc}
          editTag={editTag}
          setEditName={setEditName}
          setEditPrice={setEditPrice}
          setEditDesc={setEditDesc}
          setEditTag={setEditTag}
          onSave={onSave}
          onCancel={onCancel}
          onDelete={onDelete}
          saving={saving}
        />
      )}
    </div>
  );
}

function SectionBlock({
  section,
  fudoLookup,
  editMode,
  showFudoPrices,
  editingItem,
  editName,
  editPrice,
  editDesc,
  editTag,
  setEditName,
  setEditPrice,
  setEditDesc,
  setEditTag,
  onClickItem,
  onSave,
  onCancel,
  onDelete,
  onAdd,
  saving,
}: {
  section: MenuSection;
  fudoLookup: Map<string, FudoMergedProduct>;
  editMode: boolean;
  showFudoPrices: boolean;
  editingItem: string | null;
  editName: string;
  editPrice: string;
  editDesc: string;
  editTag: string;
  setEditName: (v: string) => void;
  setEditPrice: (v: string) => void;
  setEditDesc: (v: string) => void;
  setEditTag: (v: string) => void;
  onClickItem: (item: MenuItem) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onAdd: (sectionId: string, item: { name: string; price: number; description?: string }) => void;
  saving: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDesc, setNewDesc] = useState("");

  return (
    <div className="mb-8">
      {/* Section title */}
      <div className="mb-3">
        <h3 className="font-japanese text-xl text-menu-gold tracking-wide">
          {section.title}
        </h3>
        {section.subtitle && (
          <p className="text-[11px] text-gray-400 uppercase tracking-widest mt-0.5">
            {section.subtitle}
          </p>
        )}
      </div>

      {/* Items */}
      <div className="space-y-0.5">
        {section.items.map((item) => {
          const fudoProduct = findFudoMatch(item, fudoLookup);
          return (
            <MenuItemRow
              key={item.id}
              item={item}
              fudoProduct={fudoProduct}
              editMode={editMode}
              showFudoPrices={showFudoPrices}
              isEditing={editingItem === item.id}
              editName={editName}
              editPrice={editPrice}
              editDesc={editDesc}
              editTag={editTag}
              setEditName={setEditName}
              setEditPrice={setEditPrice}
              setEditDesc={setEditDesc}
              setEditTag={setEditTag}
              onClickItem={() => onClickItem(item)}
              onSave={onSave}
              onCancel={onCancel}
              onDelete={onDelete}
              saving={saving}
            />
          );
        })}
      </div>

      {/* Add item button (edit mode only) */}
      {editMode && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 text-sm text-menu-gold hover:text-menu-gold/80 transition-colors flex items-center gap-1 min-h-[44px]"
        >
          <span className="text-lg leading-none">+</span> Agregar item
        </button>
      )}

      {/* Add item form */}
      {editMode && adding && (
        <div className="bg-white border border-menu-gold-light rounded-lg p-4 mt-2 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Nombre</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Veggie" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-menu-gold" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Precio</label>
              <input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="24000" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-menu-gold" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase tracking-wide block mb-1">Descripcion (opc.)</label>
              <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Ingredientes..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-menu-gold" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const price = parseFloat(newPrice);
                if (!newName.trim() || isNaN(price)) return;
                onAdd(section.id, { name: newName.trim(), price, ...(newDesc.trim() ? { description: newDesc.trim() } : {}) });
                setAdding(false);
                setNewName("");
                setNewPrice("");
                setNewDesc("");
              }}
              disabled={!newName.trim() || !newPrice}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-menu-gold text-white hover:bg-menu-gold/90 disabled:bg-gray-200 disabled:text-gray-400 min-h-[44px]"
            >
              Agregar
            </button>
            <button
              onClick={() => { setAdding(false); setNewName(""); setNewPrice(""); setNewDesc(""); }}
              className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-menu-text hover:bg-gray-100 min-h-[44px]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Gold divider */}
      <div className="mt-6 border-b border-menu-gold-light/50" />
    </div>
  );
}

// ===== Main Page Component =====

export default function MenuPage() {
  const [activePage, setActivePage] = useState(0);
  const [pages, setPages] = useState<MenuPage[]>(staticPages);
  const [fudoProducts, setFudoProducts] = useState<FudoManageData | null>(null);
  const [fudoLoading, setFudoLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [showFudoPrices, setShowFudoPrices] = useState(true);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTag, setEditTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Fetch Fudo products
  const fetchFudo = useCallback(async () => {
    try {
      const res = await fetch("/api/fudo/products/manage");
      if (!res.ok) throw new Error("Error cargando productos Fudo");
      const json: FudoManageData = await res.json();
      setFudoProducts(json);
    } catch {
      // Fudo data is optional; menu still renders
      setFudoProducts(null);
    } finally {
      setFudoLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFudo();
    // Load menu data from KV (persistent storage)
    fetch("/api/menu/save")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.pages) setPages(data.pages as MenuPage[]);
      })
      .catch(() => {}); // fallback to static data already in state
  }, [fetchFudo]);

  // Build lookup
  const fudoLookup = fudoProducts
    ? buildFudoLookup(fudoProducts.products)
    : new Map<string, FudoMergedProduct>();

  // Current page
  const currentPage = pages[activePage];

  // Dismiss save result after 4 seconds
  useEffect(() => {
    if (saveResult) {
      const t = setTimeout(() => setSaveResult(null), 4000);
      return () => clearTimeout(t);
    }
  }, [saveResult]);

  // Click item to edit
  const handleClickItem = (item: MenuItem) => {
    if (!editMode) return;
    if (editingItem === item.id) {
      setEditingItem(null);
      return;
    }
    setEditingItem(item.id);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditDesc(item.description || "");
    setEditTag(item.tag || "");
  };

  // Cancel editing
  const handleCancel = () => {
    setEditingItem(null);
    setSaveResult(null);
  };

  // Save: menu KV + Fudo (all in one)
  const handleSave = async () => {
    if (!editingItem) return;

    // Find item BEFORE any state changes
    let menuItem: MenuItem | null = null;
    for (const section of currentPage.sections) {
      const found = section.items.find((i) => i.id === editingItem);
      if (found) { menuItem = found; break; }
    }
    if (!menuItem) return;

    // Capture fudo match BEFORE state changes
    const fudoProduct = findFudoMatch(menuItem, fudoLookup);

    const newPrice = parseFloat(editPrice);
    const menuChanges: { price?: number; name?: string; description?: string; tag?: string } = {};
    if (!isNaN(newPrice) && newPrice !== menuItem.price) menuChanges.price = newPrice;
    if (editName.trim() && editName.trim() !== menuItem.name) menuChanges.name = editName.trim();
    if (editDesc !== (menuItem.description || "")) menuChanges.description = editDesc;
    if (editTag.trim() !== (menuItem.tag || "")) menuChanges.tag = editTag.trim();

    if (Object.keys(menuChanges).length === 0) {
      setSaveResult({ type: "success", msg: "Sin cambios" });
      return;
    }

    setSaving(true);
    setSaveResult(null);
    const msgs: string[] = [];

    try {
      // Save menu only (no Fudo sync)
      const res = await fetch("/api/menu/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editingItem,
          changes: menuChanges,
        }),
      });
      const result = await res.json();

      if (result.success) {
        setPages((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              items: s.items.map((i) =>
                i.id === editingItem ? { ...i, ...menuChanges } : i
              ),
            })),
          }))
        );
        msgs.push("Menu \u2713");

        // Show Fudo results
        if (result.fudo) {
          const ok = result.fudo.filter((r: { success: boolean }) => r.success).length;
          const fail = result.fudo.filter((r: { success: boolean }) => !r.success).length;
          if (fail === 0) {
            msgs.push(`Fudo \u2713 (${ok} suc.)`);
          } else {
            msgs.push(`Fudo: ${ok} OK, ${fail} fallaron`);
          }
          setTimeout(() => fetchFudo(), 2000);
        }
      } else {
        msgs.push("Error: " + (result.error || "desconocido"));
      }

      setSaveResult({ type: result.success ? "success" : "error", msg: msgs.join(" | ") });
      setEditingItem(null);
    } catch {
      setSaveResult({ type: "error", msg: "Error de conexion" });
    } finally {
      setSaving(false);
    }
  };

  // Delete item from menu
  const handleDelete = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const res = await fetch("/api/menu/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", itemId: editingItem }),
      });
      const result = await res.json();
      if (result.success) {
        setPages((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) => ({
              ...s,
              items: s.items.filter((i) => i.id !== editingItem),
            })),
          }))
        );
        setSaveResult({ type: "success", msg: "Eliminado del menu" });
        setEditingItem(null);
      } else {
        setSaveResult({ type: "error", msg: result.error || "Error al eliminar" });
      }
    } catch {
      setSaveResult({ type: "error", msg: "Error de conexion" });
    } finally {
      setSaving(false);
    }
  };

  // Add item to menu
  const handleAdd = async (sectionId: string, item: { name: string; price: number; description?: string }) => {
    setSaving(true);
    try {
      const res = await fetch("/api/menu/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", sectionId, item }),
      });
      const result = await res.json();
      if (result.success && result.item) {
        setPages((prev) =>
          prev.map((p) => ({
            ...p,
            sections: p.sections.map((s) =>
              s.id === sectionId
                ? { ...s, items: [...s.items, result.item as MenuItem] }
                : s
            ),
          }))
        );
        setSaveResult({ type: "success", msg: `"${item.name}" agregado` });
      } else {
        setSaveResult({ type: "error", msg: result.error || "Error al agregar" });
      }
    } catch {
      setSaveResult({ type: "error", msg: "Error de conexion" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-menu-cream">
      {/* ===== Top Bar ===== */}
      <div className="sticky top-0 z-30 bg-menu-cream/95 backdrop-blur border-b border-menu-gold-light/50 no-print">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-japanese text-2xl text-menu-text tracking-wide">
              Menu Masunori
            </h1>
            <div className="flex items-center gap-2">
              {/* Edit mode toggle */}
              <button
                onClick={() => {
                  setEditMode(!editMode);
                  setEditingItem(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[44px] ${
                  editMode
                    ? "bg-menu-gold text-white"
                    : "bg-white border border-gray-200 text-gray-500 hover:border-menu-gold"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
                <span className="hidden sm:inline">Edicion</span>
              </button>

              {/* Fudo prices toggle */}
              <button
                onClick={() => setShowFudoPrices(!showFudoPrices)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[44px] ${
                  showFudoPrices
                    ? "bg-menu-gold text-white"
                    : "bg-white border border-gray-200 text-gray-500 hover:border-menu-gold"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {showFudoPrices ? (
                    <>
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" x2="22" y1="2" y2="22" />
                    </>
                  )}
                </svg>
                <span className="hidden sm:inline">Fudo</span>
              </button>

              {/* Sync Fudo button */}
              <button
                onClick={async () => {
                  setSaveResult(null);
                  setSaving(true);
                  try {
                    const res = await fetch("/api/menu/sync-fudo", { method: "POST" });
                    const result = await res.json();
                    if (result.success) {
                      setSaveResult({
                        type: "success",
                        msg: `Sync: ${result.verified} verificados, ${result.newMatches} nuevos, ${result.notFound} sin match`,
                      });
                      // Reload menu data from KV + refresh Fudo
                      fetch("/api/menu/save").then(r => r.ok ? r.json() : null).then(d => {
                        if (d?.pages) setPages(d.pages as MenuPage[]);
                      });
                      fetchFudo();
                    } else {
                      setSaveResult({ type: "error", msg: result.error || "Error sync" });
                    }
                  } catch {
                    setSaveResult({ type: "error", msg: "Error de conexion" });
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-menu-text hover:bg-gray-50 min-h-[44px] disabled:opacity-50"
                title="Sincronizar matches con Fudo"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                <span className="hidden sm:inline">{saving ? "Sincronizando..." : "Sync Fudo"}</span>
              </button>

              {/* PDF / Print button — opens menu HTML with live prices from KV */}
              <button
                onClick={() => {
                  const w = window.open("/api/menu/print", "_blank");
                  if (w) {
                    w.addEventListener("load", () => {
                      setTimeout(() => w.print(), 500);
                    });
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-menu-text hover:bg-gray-50 min-h-[44px]"
                title="Imprimir / Descargar PDF (A3 horizontal)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                <span className="hidden sm:inline">PDF</span>
              </button>

              {/* English PDF button */}
              <button
                onClick={() => {
                  const w = window.open("/api/menu/print/en", "_blank");
                  if (w) { w.addEventListener("load", () => { setTimeout(() => w.print(), 500); }); }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-menu-text hover:bg-gray-50 min-h-[44px]"
                title="English menu (no prices)"
              >
                <span>🇬🇧</span>
                <span className="hidden sm:inline">EN</span>
              </button>

              {/* Russian PDF button */}
              <button
                onClick={() => {
                  const w = window.open("/api/menu/print/ru", "_blank");
                  if (w) { w.addEventListener("load", () => { setTimeout(() => w.print(), 500); }); }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-menu-text hover:bg-gray-50 min-h-[44px]"
                title="Russian menu (no prices)"
              >
                <span>🇷🇺</span>
                <span className="hidden sm:inline">RU</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Page Navigation Tabs ===== */}
      <div className="sticky top-[65px] z-20 bg-menu-cream/95 backdrop-blur border-b border-menu-gold-light/30 no-print">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide -mx-4 px-4">
            {pages.map((page, idx) => (
              <button
                key={page.id}
                onClick={() => {
                  setActivePage(idx);
                  setEditingItem(null);
                }}
                className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all min-h-[44px] ${
                  activePage === idx
                    ? "bg-menu-gold text-white shadow-sm"
                    : "text-gray-500 hover:text-menu-text hover:bg-white/80"
                }`}
              >
                {page.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Save Result Banner ===== */}
      {saveResult && (
        <div className="max-w-3xl mx-auto px-4 mt-3">
          <div
            className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
              saveResult.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {saveResult.type === "success" ? "OK" : "Error"}:{" "}
            {saveResult.msg}
          </div>
        </div>
      )}

      {/* ===== Fudo Loading Indicator ===== */}
      {fudoLoading && showFudoPrices && (
        <div className="max-w-3xl mx-auto px-4 mt-3">
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-menu-gold-light border-t-menu-gold rounded-full animate-spin" />
            Cargando precios Fudo...
          </div>
        </div>
      )}

      {/* ===== Menu Content ===== */}
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        {/* Page title */}
        <div className="text-center mb-8">
          <h2 className="font-japanese text-3xl text-menu-text tracking-wide">
            {currentPage.title}
          </h2>
          <div className="mt-3 flex justify-center">
            <div className="w-16 h-px bg-menu-gold" />
            <div className="w-2 h-2 rounded-full bg-menu-gold mx-2 -mt-0.5" />
            <div className="w-16 h-px bg-menu-gold" />
          </div>
        </div>

        {/* Sections */}
        {currentPage.sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            fudoLookup={fudoLookup}
            editMode={editMode}
            showFudoPrices={showFudoPrices}
            editingItem={editingItem}
            editName={editName}
            editPrice={editPrice}
            editDesc={editDesc}
            editTag={editTag}
            setEditName={setEditName}
            setEditPrice={setEditPrice}
            setEditDesc={setEditDesc}
            setEditTag={setEditTag}
            onClickItem={handleClickItem}
            onSave={handleSave}
            onCancel={handleCancel}
            onDelete={handleDelete}
            onAdd={handleAdd}
            saving={saving}
          />
        ))}

        {/* Bottom ornament */}
        <div className="text-center mt-8 mb-4 no-print">
          <div className="flex justify-center items-center">
            <div className="w-12 h-px bg-menu-gold-light" />
            <span className="mx-3 text-menu-gold-light text-lg font-japanese">
              &#10022;
            </span>
            <div className="w-12 h-px bg-menu-gold-light" />
          </div>
          <p className="text-[10px] text-gray-400 mt-3 uppercase tracking-widest">
            Masunori &middot; Japanese Fusion
          </p>
        </div>
      </div>

      {/* PDF uses /menu-print.html (original HTML) opened in new tab */}
    </div>
  );
}
