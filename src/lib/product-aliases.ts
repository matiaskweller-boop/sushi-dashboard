/**
 * Product and category name normalization.
 * Automatically unifies products/categories that differ only in:
 * - Capitalization (ASAHI vs Asahi)
 * - Accents (Clásico vs Clasico)
 * - Extra spaces (Saint Felicien  chardonnay)
 * - Punctuation (Stella Artois. vs Stella Artois)
 * - X vs x (Niguiri Trucha X 2 vs x 2)
 * - Minor prepositions (Bocha de Pistacho vs Bocha Pistacho)
 *
 * Also handles manual overrides for products that need specific canonical names.
 */

// ===== Category Aliases =====
// Map normalized category name → canonical display name
const CATEGORY_ALIASES: Record<string, string> = {
  "blanco": "Vinos Blancos",
  "tinto": "Vinos Tintos",
  "rosado": "Vinos Rosados",
  "rose": "Vinos Rosados",
  "espumante": "Espumantes",
  "vinos": "Vinos Tintos",
  "vino por copa": "Vinos por Copa",
  "copa": "Vinos por Copa",
  "combo": "Combos",
  "medida": "Medidas",
  "medidas": "Medidas",
  "extra": "Extras",
  "extras": "Extras",
  "eventos": "Eventos",
  "menu veggie": "Menu Veggie",
  "menu ejecutivo 12 a 16": "Menu Ejecutivo",
  "menu ejecutivo de 12 a 16": "Menu Ejecutivo",
  "no se ve en tienda": "Internos",
  "no se ve en dienda": "Internos",
  "servicios": "Internos",
  "platos frios": "Platos",
  "bebidas alcoholicas": "Tragos",
  "individuales": "Combos",
  "salsas": "Extras",
  "tartares": "Platos",
  "temporada": "Platos",
};

// ===== Manual Product Aliases =====
// normalized name → canonical display name (only for non-obvious cases)
const PRODUCT_ALIASES: Record<string, string> = {
  // Postres
  "alfajor blanco": "Alfajor blanco Simkolate",
  "alfajor negro": "Alfajor negro Simkolate",
  "alfajor simkolate blanco": "Alfajor blanco Simkolate",
  "alfajor simkolate chocolate": "Alfajor Simkolate chocolate",
  "alfajor simkolatte pistacho": "Alfajor pistacho Simkolatte",
  "bocha de pistacho": "Bocha Pistacho",
  "bocha de sambayon": "Bocha Sambayon",
  // Ceviche naming
  "ceviche al aji amarillo": "Ceviche Ají Amarillo",
  // BIRA wines
  "bira bianco de uco": "BIRA Bianco D'UCO",
  "bira bin otto malbec": "BIRA Bin Otto",
  "bira tano": "BIRA Tano Malbec",
  // Rolls spacing
  "buenos aires roll trucha x10": "Buenos Aires Trucha Roll x10",
};

/**
 * Aggressive normalization for matching:
 * lowercase, remove accents, remove all non-alphanumeric, collapse spaces
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[´`''·.,:;!?¿¡()\-_/\\+]/g, " ") // punctuation to space
    .replace(/[^\w\s]/g, "") // remove remaining non-word chars
    .replace(/\s+/g, " ")
    .trim();
}

// Build a lookup cache: normalized → canonical name (chosen by first manual alias, or kept)
const _productCache = new Map<string, string>();

/**
 * Get canonical display name for a product.
 * Auto-merges same-normalized names and applies manual aliases.
 */
export function getCanonicalName(name: string): string {
  const norm = normalize(name);

  // Check manual aliases
  if (PRODUCT_ALIASES[norm]) {
    return PRODUCT_ALIASES[norm];
  }

  // Auto-merge: first seen name for this normalization wins
  if (_productCache.has(norm)) {
    return _productCache.get(norm)!;
  }

  // Store this as the canonical name for this normalized form
  // Prefer title-case versions over ALL CAPS
  const isAllCaps = name === name.toUpperCase() && name.length > 3;
  const displayName = isAllCaps ? titleCase(name) : name;
  _productCache.set(norm, displayName);
  return displayName;
}

/**
 * Get normalized key for grouping products (used as Map key).
 */
export function getNormalizedKey(name: string): string {
  const norm = normalize(name);
  // Check if manual alias points to a different name, use that name's norm as key
  if (PRODUCT_ALIASES[norm]) {
    return normalize(PRODUCT_ALIASES[norm]);
  }
  return norm;
}

/**
 * Get canonical display name for a category.
 */
export function getCanonicalCategory(categoryName: string): string {
  const norm = normalize(categoryName);
  if (CATEGORY_ALIASES[norm]) {
    return CATEGORY_ALIASES[norm];
  }
  // Auto-normalize: first-letter-uppercase
  const isAllCaps = categoryName === categoryName.toUpperCase() && categoryName.length > 3;
  if (isAllCaps) return titleCase(categoryName);
  return categoryName;
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
