/**
 * UI Text & Formatting Utilities
 */

export function cleanText(input: any): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'object') {
    if (typeof input.name === 'string') {
      return cleanText(input.name);
    }
    if (typeof input.title === 'string') {
      return cleanText(input.title);
    }
    return '';
  }
  return String(input)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function formatUnit(quantity: number, unit: string): string {
  const norm = (unit || '').toLowerCase().trim();
  if (norm === 'l' || norm === 'litre' || norm === 'litres' || norm === 'liter' || norm === 'liters') {
    return 'L';
  }
  if (norm === 'piece' || norm === 'pieces') {
    return Math.abs(quantity) === 1 ? 'piece' : 'pieces';
  }
  if (norm === 'tin' || norm === 'tins' || norm === 'can' || norm === 'cans') {
    return Math.abs(quantity) === 1 ? 'tin' : 'tins';
  }
  if (norm === 'clove' || norm === 'cloves') {
    return Math.abs(quantity) === 1 ? 'clove' : 'cloves';
  }
  if (norm === 'slice' || norm === 'slices') {
    return Math.abs(quantity) === 1 ? 'slice' : 'slices';
  }
  if (norm === 'bunch' || norm === 'bunches') {
    return Math.abs(quantity) === 1 ? 'bunch' : 'bunches';
  }
  if (norm === 'pack' || norm === 'packs') {
    return Math.abs(quantity) === 1 ? 'pack' : 'packs';
  }
  if (norm === 'item' || norm === 'items') {
    return Math.abs(quantity) === 1 ? 'item' : 'items';
  }
  if (norm === 'g' || norm === 'gram' || norm === 'grams') {
    return 'g';
  }
  if (norm === 'kg' || norm === 'kilogram' || norm === 'kilograms') {
    return 'kg';
  }
  if (norm === 'ml' || norm === 'millilitre' || norm === 'millilitres') {
    return 'ml';
  }
  return unit;
}

export function formatQuantityWithUnit(quantity: number | string, unit: string): string {
  const num = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  if (isNaN(num)) return `${quantity} ${unit || ''}`.trim();
  const u = formatUnit(num, unit);
  const numStr = Number.isInteger(num) ? num.toString() : parseFloat(num.toFixed(2)).toString();
  return `${numStr} ${u}`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  const p = plural || (singular === 'piece' ? 'pieces' : `${singular}s`);
  return `${count} ${Math.abs(count) === 1 ? singular : p}`;
}

