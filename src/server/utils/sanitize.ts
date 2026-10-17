/**
 * Strips dangerous HTML tags and control characters to prevent XSS/injection
 * while preserving standard punctuation (&, ', "), emojis, RTL, and UTF-8 text.
 */
export function sanitizeString(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // Strip control characters
    .trim();
}

/**
 * Utility to decode any legacy HTML entities (&amp;, &quot;, &#039;, &lt;, &gt;)
 */
export function unescapeHtml(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
