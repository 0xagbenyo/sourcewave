/** Small helpers shared by Raven search UIs (message previews, channel labels). */

export function friendlySenderLabel(owner?: string): string {
  const t = (owner || '').trim();
  if (!t) return 'Unknown';
  if (t.includes('@')) {
    const local = t.split('@')[0];
    if (local) return local.replace(/[._]/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  }
  return t;
}

export function replySnippet(text?: string): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Message';
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}

export function channelPrefix(type?: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('direct') || t.includes('dm')) return '';
  if (t.includes('open') || t.includes('public')) return '#';
  return '#';
}
