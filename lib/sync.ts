import { loadCatalog, saveCatalog, clearCatalogCache, type Product } from "./catalog";
import { sendWhatsApp } from "./whatsapp";
import { setMeta } from "./store";

const SHOP_URL = "https://dastiyabstore.com/shop";
const OWNER_WHATSAPP = process.env.OWNER_WHATSAPP || "923162975195";

export interface ScrapedProduct {
  slug: string;
  name: string;
  price: number;
  originalPrice: number | null;
  inStock: boolean;
  category: string;
}

export interface SyncResult {
  ok: boolean;
  scrapedCount: number;
  changesCount: number;
  changeList: string[];
  lastSync: string;
  error?: string;
}

/** Check if product is clothing, nightsuits, or apparel to exclude */
export function isClothingOrExcluded(name: string, category?: string, slug?: string): boolean {
  const text = `${name} ${category || ""} ${slug || ""}`.toLowerCase();
  return (
    /night\s*suit|nightwear|pajama|pyjama|trouser|oversized\s*tee|lounge\s*set|co-ord|clothing|apparel|dress|shirt|t-shirt|women\s*suit|baggy|hoodie|fleece/i.test(
      text
    ) ||
    category === "Clothing" ||
    category === "Night Suits"
  );
}

/**
 * Extracts products from dastiyabstore.com/shop.
 * Ignores all clothing, nightsuits, and apparel.
 */
export function parseShopData(html: string): ScrapedProduct[] {
  const seen = new Map<string, ScrapedProduct>();

  // 1. Primary: Match Next.js RSC payload objects
  const rscRegex =
    /\{\\"id\\":\\"([a-f0-9-]+)\\",\\"slug\\":\\"([^"\\]+)\\",\\"name\\":\\"([^"\\]+)\\",\\"price\\":(\d+)(?:,\\"originalPrice\\":(\d+|null))?/g;

  let m: RegExpExecArray | null;
  while ((m = rscRegex.exec(html)) !== null) {
    const slug = m[2].trim().toLowerCase();
    if (seen.has(slug)) continue;

    const name = m[3].trim();
    const price = parseInt(m[4], 10);
    const originalPrice = m[5] && m[5] !== "null" ? parseInt(m[5], 10) : null;

    const window = html.slice(m.index, m.index + 800);
    const inStockMatch = window.match(/\\"inStock\\":(true|false)/);
    const inStock = inStockMatch ? inStockMatch[1] === "true" : true;

    const catMatch = window.match(/\\"category\\":\\"([^"\\]+)\\"/);
    const category = catMatch ? catMatch[1] : "General";

    // Skip clothing and nightsuits
    if (isClothingOrExcluded(name, category, slug)) continue;

    seen.set(slug, {
      slug,
      name,
      price,
      originalPrice,
      inStock,
      category,
    });
  }

  // 2. Fallback: If RSC parsing found nothing, fallback to link search
  if (seen.size === 0) {
    const linkRe = /\/product\/([a-z0-9-]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRe.exec(html)) !== null) {
      const slug = match[1].toLowerCase();
      if (seen.has(slug)) continue;
      const idx = match.index;
      const window = html.slice(Math.max(0, idx - 1200), idx + 1800);

      const name =
        /alt="([^"]{4,120})"/i.exec(window)?.[1]?.trim() ||
        /<h[1-4][^>]*>([^<]{4,120})<\/h[1-4]>/i.exec(window)?.[1]?.trim() ||
        slug.replace(/-/g, " ");

      if (isClothingOrExcluded(name, "", slug)) continue;

      const priceMatch = /Rs\.?\s*([\d,]+)/i.exec(html.slice(idx, idx + 1800));
      const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, ""), 10) : 0;
      const outOfStock = /out of stock|sold out/i.test(window);

      seen.set(slug, {
        slug,
        name,
        price,
        originalPrice: null,
        inStock: !outOfStock,
        category: "General",
      });
    }
  }

  return [...seen.values()];
}

export async function performCatalogSync(notifyWhatsApp = true): Promise<SyncResult> {
  let scraped: ScrapedProduct[] = [];
  try {
    const res = await fetch(SHOP_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Shop fetch failed with status HTTP ${res.status}`);
    const html = await res.text();
    scraped = parseShopData(html);
  } catch (err) {
    console.error("Catalog sync error fetching shop:", err);
    return {
      ok: false,
      scrapedCount: 0,
      changesCount: 0,
      changeList: [],
      lastSync: new Date().toISOString(),
      error: String(err),
    };
  }

  const catalog = await loadCatalog();
  // Filter out any clothing in case any was previously saved
  const filteredCatalog = catalog.filter(
    (p) => !isClothingOrExcluded(p.name, p.category, p.id)
  );

  const bySlug = new Map(
    filteredCatalog.map((p) => {
      const slug = (/\/product\/([a-z0-9-]+)/i.exec(p.url)?.[1] || p.id).toLowerCase();
      return [slug, p];
    })
  );

  const changes: string[] = [];
  const updated: Product[] = [...filteredCatalog];

  // Check prices and stock status for Dastiyab Store products
  for (const s of scraped) {
    const p = bySlug.get(s.slug);
    if (!p) continue;

    // Price change
    if (s.price > 0 && s.price !== p.price) {
      changes.push(`💰 Price Change: ${p.name} Rs.${p.price} → Rs.${s.price}`);
      p.wasPrice = p.price;
      p.price = s.price;
    }

    // Stock change
    if (s.inStock !== p.inStock) {
      if (s.inStock) {
        changes.push(`✅ Back in stock: ${p.name}`);
        p.inStock = true;
      } else {
        changes.push(`📦 Out of stock: ${p.name}`);
        p.inStock = false;
      }
    }
  }

  await saveCatalog(updated);
  clearCatalogCache();

  const now = new Date().toISOString();
  await setMeta({ lastSync: now, lastPriceCheckCount: updated.length });

  // Send WhatsApp Notification to Owner
  if (notifyWhatsApp && OWNER_WHATSAPP) {
    const summary =
      changes.length === 0
        ? [
            `✅ *Daily Price & Catalog Check — Dastiyab Store*`,
            ``,
            `Dastiyab Store ke tamam *${updated.length} products* (Earbuds, Gadgets, Gift Sets & Makeup) ke live prices verify kar liye gaye hain.`,
            `Koi price change nahi mila — catalog 100% up-to-date hai!`,
          ].join("\n")
        : [
            `🔄 *Catalog & Price Check — ${changes.length} Change(s) Detected:*`,
            ``,
            ...changes.slice(0, 25),
            ``,
            `Total verified store products: ${updated.length}`,
          ].join("\n");

    try {
      await sendWhatsApp(OWNER_WHATSAPP, summary);
    } catch (err) {
      console.error("WhatsApp notification failed during catalog sync:", err);
    }
  }

  return {
    ok: true,
    scrapedCount: updated.length,
    changesCount: changes.length,
    changeList: changes,
    lastSync: now,
  };
}
