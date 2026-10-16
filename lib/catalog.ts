import { promises as fs } from "fs";
import path from "path";
import bundledCatalog from "../data/catalog.json";

/**
 * Product as the agent understands it.
 * IMPORTANT: Dastiyab Store's own products have NO variant selectors —
 * a theme/color difference (e.g. 3-in-1 Pink vs Purple) is a SEPARATE
 * product listing with its own id. The agent must therefore treat
 * `theme` as part of the product's identity, never as a choosable option.
 */
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number; // current price in PKR
  wasPrice: number | null; // original price in PKR, if discounted
  inStock: boolean;
  url: string;
  theme: string | null; // color / character theme baked into this listing
  tags: string[]; // search keywords
  needsReview?: boolean; // true for auto-added products the owner hasn't verified yet
}

// Writable dir for the daily-synced catalog copy.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

let cache: Product[] | null = null;

export async function loadCatalog(): Promise<Product[]> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "catalog.json"), "utf-8");
    cache = JSON.parse(raw) as Product[];
  } catch {
    // No synced copy yet (or unreadable) — fall back to the bundled snapshot.
    cache = bundledCatalog as Product[];
  }
  return cache;
}

/** Persist an updated catalog (used by the daily sync cron). */
export async function saveCatalog(products: Product[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, "catalog.json"),
    JSON.stringify(products, null, 2)
  );
  cache = products;
}

export function clearCatalogCache(): void {
  cache = null;
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const all = await loadCatalog();
  return all.find((p) => p.id === id);
}

export async function inStockProducts(): Promise<Product[]> {
  const all = await loadCatalog();
  return all.filter((p) => p.inStock);
}

/**
 * Simple token-based product search over name/category/theme/tags.
 * Out-of-stock items are excluded by default.
 */
export async function searchProducts(
  query: string,
  opts: { includeOutOfStock?: boolean } = {}
): Promise<Product[]> {
  const all = await loadCatalog();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return [];

  return all
    .filter((p) => opts.includeOutOfStock || p.inStock)
    .map((p) => {
      const hay =
        `${p.name} ${p.category} ${p.theme ?? ""} ${p.tags.join(" ")}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += t.length > 4 ? 2 : 1;
      }
      return { p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.p);
}

/** Compact catalog text injected into the agent's system prompt. */
export async function catalogSummary(): Promise<string> {
  const products = await inStockProducts();
  const lines = products.map(
    (p) =>
      `- [${p.id}] ${p.name}${p.theme ? ` (${p.theme})` : ""} — Rs.${p.price}`
  );
  return `Dastiyab Store products (IN STOCK ONLY, ${products.length} items):\n${lines.join(
    "\n"
  )}`;
}
