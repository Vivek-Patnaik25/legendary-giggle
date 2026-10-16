import { getDb } from '../db/index.js';

export interface BarcodeProduct {
  barcode: string;
  name: string;
  category: string;
  brand?: string;
  quantity?: number;
  unit?: string;
  imageUrl?: string;
  found: boolean;
  source: 'cache' | 'openfoodfacts' | 'manual';
}

const USER_AGENT = process.env.USER_AGENT || 'PantryRescue/1.0.0 (https://github.com/Vivek-Patnaik25/legendary-giggle; dev@pantryrescue.local)';
const CACHE_TTL_SECONDS = 86400; // 24 hours

/**
 * Category normalizer from Open Food Facts categories tags
 */
function normalizeCategory(categoriesTags?: string[]): string {
  if (!categoriesTags || categoriesTags.length === 0) return 'general';
  const tagStr = categoriesTags.join(' ').toLowerCase();

  if (tagStr.includes('dairy') || tagStr.includes('milk') || tagStr.includes('cheese') || tagStr.includes('yogurt')) {
    return 'dairy';
  }
  if (tagStr.includes('meat') || tagStr.includes('poultry') || tagStr.includes('chicken') || tagStr.includes('beef')) {
    return 'meat';
  }
  if (tagStr.includes('fish') || tagStr.includes('seafood') || tagStr.includes('prawn')) {
    return 'seafood';
  }
  if (tagStr.includes('vegetable') || tagStr.includes('fruit') || tagStr.includes('plant-based')) {
    return 'produce';
  }
  if (tagStr.includes('bread') || tagStr.includes('bakery') || tagStr.includes('pastry')) {
    return 'bakery';
  }
  if (tagStr.includes('canned') || tagStr.includes('pasta') || tagStr.includes('rice') || tagStr.includes('cereal')) {
    return 'pantry_staple';
  }
  if (tagStr.includes('sauce') || tagStr.includes('condiment') || tagStr.includes('spread')) {
    return 'condiments';
  }

  return 'general';
}

/**
 * Lookup barcode with cache-first strategy and descriptive User-Agent
 */
export async function lookupBarcode(barcodeRaw: string): Promise<BarcodeProduct> {
  const barcode = String(barcodeRaw).trim();
  const db = getDb();
  const cacheKey = `barcode:${barcode}`;

  // 1. Check SQLite cache
  const cached = db.prepare(`
    SELECT value FROM cache_entries
    WHERE key = ? AND expires_at > datetime('now')
  `).get(cacheKey) as { value: string } | undefined;

  if (cached) {
    try {
      const parsed = JSON.parse(cached.value);
      return { ...parsed, source: 'cache' };
    } catch {
      // ignore parsing error, proceed to fetch
    }
  }

  // 2. Query Open Food Facts API with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout

    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data: any = await response.json();
      if (data && data.status === 1 && data.product) {
        const p = data.product;
        const name = p.product_name || p.generic_name || p.product_name_en || 'Unknown Product';
        const brand = p.brands || '';
        const category = normalizeCategory(p.categories_tags);
        const imageUrl = p.image_front_url || p.image_url;

        const product: BarcodeProduct = {
          barcode,
          name: brand ? `${brand} ${name}` : name,
          category,
          brand,
          imageUrl,
          found: true,
          source: 'openfoodfacts',
        };

        // Cache the result
        db.prepare(`
          INSERT INTO cache_entries (key, value, expires_at)
          VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
        `).run(cacheKey, JSON.stringify(product), CACHE_TTL_SECONDS);

        return product;
      }
    }
  } catch (err: any) {
    // Open Food Facts network failure or timeout - fail gracefully to manual entry
    console.warn(`Barcode lookup offline/failed for ${barcode}:`, err.message);
  }

  // 3. Fallback when not found or offline
  return {
    barcode,
    name: '',
    category: 'general',
    found: false,
    source: 'manual',
  };
}
