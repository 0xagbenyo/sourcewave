import { normalizeFrappeApiBaseUrl } from '../services/erpnext';

/**
 * [Raven](https://github.com/The-Commit-Company/raven) — team chat on your Frappe site.
 * Default path matches a typical install: `/raven/Raven/`.
 * Override with EXPO_PUBLIC_RAVEN_URL if yours differs.
 */
export function getRavenWebUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_RAVEN_URL?.trim();
  if (fromEnv) return fromEnv;
  const base = normalizeFrappeApiBaseUrl(
    process.env.EXPO_PUBLIC_ERPNEXT_URL || 'https://sourcewave.frappe.cloud'
  );
  return `${base}/raven/Raven/`;
}

/**
 * Raven v2 routes as `/raven/Raven/<workspace_name>/`. Strips an existing workspace segment
 * so you can append the id returned by `raven.api.workspaces.get_list` (Raven Workspace `name`).
 */
export function getRavenWorkspaceBaseUrl(fullUrl?: string): string {
  const raw = (fullUrl?.trim() || getRavenWebUrl()).replace(/\/+$/, '');
  const m = raw.match(/^(.*?\/raven\/Raven)(?:\/[^/]+)?$/i);
  if (m) return m[1];
  return raw;
}

/** True if `fullUrl` already contains a workspace id after `/raven/Raven/`. */
export function ravenUrlHasWorkspaceSegment(fullUrl: string): boolean {
  const base = getRavenWorkspaceBaseUrl(fullUrl).replace(/\/+$/, '');
  const trimmed = fullUrl.trim().replace(/\/+$/, '');
  return trimmed.length > base.length;
}

export function buildRavenUrlWithWorkspace(workspaceId: string, fullUrl?: string): string {
  const id = workspaceId.replace(/^\/+|\/+$/g, '');
  const base = getRavenWorkspaceBaseUrl(fullUrl).replace(/\/+$/, '');
  return `${base}/${id}/`;
}
