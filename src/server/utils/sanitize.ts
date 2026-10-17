/**
 * Strips dangerous HTML/script characters to prevent XSS while preserving emojis, RTL, and UTF-8 text
 */
export function sanitizeString(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .trim();
}
