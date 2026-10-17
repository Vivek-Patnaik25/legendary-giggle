/**
 * UI Text & Formatting Utilities
 */

export function cleanText(input: any): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function pluralize(count: number, singular: string, plural?: string): string {
  const p = plural || `${singular}s`;
  return `${count} ${Math.abs(count) === 1 ? singular : p}`;
}
