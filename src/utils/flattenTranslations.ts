/**
 * Flatten nested translation objects (string leaves only) for machine translation,
 * then rebuild the same shape from translated strings.
 */
export function flattenStringLeaves(
  obj: Record<string, unknown>,
  prefix = ''
): { paths: string[]; values: string[] } {
  const paths: string[] = [];
  const values: string[] = [];

  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const sub = flattenStringLeaves(v as Record<string, unknown>, path);
      paths.push(...sub.paths);
      values.push(...sub.values);
    } else if (typeof v === 'string' && v.length > 0) {
      paths.push(path);
      values.push(v);
    }
  }
  return { paths, values };
}

export function unflattenStringLeaves(paths: string[], values: string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (let i = 0; i < paths.length; i++) {
    const parts = paths[i].split('.');
    let cur: Record<string, unknown> = root;
    for (let j = 0; j < parts.length - 1; j++) {
      const p = parts[j];
      if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
        cur[p] = {};
      }
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = values[i];
  }
  return root;
}

/** Cheap stable hash for cache invalidation when English bundle changes */
export function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
