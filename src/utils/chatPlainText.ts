/**
 * Raven may store HTML in message `text`. Show readable plain text in native bubbles.
 */
export function plainTextFromMaybeHtml(raw: string | undefined | null): string {
  if (raw == null) return '';
  const s = String(raw);
  if (!s.includes('<')) return s;
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
