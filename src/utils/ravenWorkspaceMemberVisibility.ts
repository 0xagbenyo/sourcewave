import type { RavenWorkspaceMemberRow } from '../services/ravenNativeApi';

function normalizeId(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}

/** Frappe/Raven Check fields: may arrive as 0/1, boolean, or string from the API. */
export function ravenFrappeCheckTruthy(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  }
  return false;
}

/** `is_admin` on Raven Workspace Member (workspace administrator, not supplier roster). */
export function ravenWorkspaceMemberIsAdmin(m: RavenWorkspaceMemberRow): boolean {
  return ravenFrappeCheckTruthy(m.is_admin as unknown);
}

/**
 * Custom Check on **Raven Workspace Member** — supplier representatives in this workspace.
 * @see `custom_is_supplier` in Frappe (your site adds this field).
 */
export function ravenWorkspaceMemberIsSupplier(m: RavenWorkspaceMemberRow): boolean {
  return ravenFrappeCheckTruthy(m.custom_is_supplier as unknown);
}

/** True if `candidateUserId` matches a `Raven Workspace Member.user` (normalized). */
export function ravenWorkspaceMembersIncludeUserId(
  members: RavenWorkspaceMemberRow[],
  candidateUserId: string | null | undefined
): boolean {
  const needle = normalizeId(candidateUserId);
  if (!needle) return false;
  return members.some((m) => normalizeId(m.user) === needle);
}

/** Same identity rules as `viewerIsRavenWorkspaceAdmin` for a single row. */
export function ravenWorkspaceMemberMatchesViewer(
  m: RavenWorkspaceMemberRow,
  viewerEmail: string | null | undefined,
  viewerUserId: string | null | undefined
): boolean {
  const mu = normalizeId(m.user);
  const e = normalizeId(viewerEmail);
  const u = normalizeId(viewerUserId);
  return (e.length > 0 && mu === e) || (u.length > 0 && mu === u);
}

/** Whether the signed-in user is a workspace admin in this member list. */
export function viewerIsRavenWorkspaceAdmin(
  members: RavenWorkspaceMemberRow[],
  viewerEmail: string | null | undefined,
  viewerUserId: string | null | undefined
): boolean {
  return members.some(
    (m) => ravenWorkspaceMemberMatchesViewer(m, viewerEmail, viewerUserId) && ravenWorkspaceMemberIsAdmin(m)
  );
}

/** Supplier-tagged members first (`custom_is_supplier`), then stable alphabetical by `user`. */
export function sortRavenMembersForDirectory(members: RavenWorkspaceMemberRow[]): RavenWorkspaceMemberRow[] {
  return [...members].sort((a, b) => {
    const da = ravenWorkspaceMemberIsSupplier(a) ? 0 : 1;
    const db = ravenWorkspaceMemberIsSupplier(b) ? 0 : 1;
    if (da !== db) return da - db;
    return String(a.user).localeCompare(String(b.user), undefined, { sensitivity: 'base' });
  });
}

/**
 * Returns the full workspace member list from the API (everyone in the workspace can DM anyone).
 * Sort order: **`custom_is_supplier`** members first, then alphabetical by `user`.
 */
export function filterRavenMembersVisibleToViewer(
  members: RavenWorkspaceMemberRow[],
  _viewerEmail: string | null | undefined,
  _viewerUserId: string | null | undefined
): RavenWorkspaceMemberRow[] {
  return sortRavenMembersForDirectory(members);
}

/** Workspace administrators only (`is_admin`), sorted by `user`. */
export function ravenWorkspaceAdminsSorted(members: RavenWorkspaceMemberRow[]): RavenWorkspaceMemberRow[] {
  return members
    .filter((m) => ravenWorkspaceMemberIsAdmin(m))
    .sort((a, b) => String(a.user).localeCompare(String(b.user), undefined, { sensitivity: 'base' }));
}

/** Buyer supplier list / drawer: workspace admins only, excluding the signed-in user. */
export function ravenWorkspaceSupplierAdminsForList(
  members: RavenWorkspaceMemberRow[],
  viewerEmail: string | null | undefined,
  viewerUserId: string | null | undefined
): RavenWorkspaceMemberRow[] {
  return ravenWorkspaceAdminsSorted(members).filter(
    (m) => !ravenWorkspaceMemberMatchesViewer(m, viewerEmail, viewerUserId)
  );
}

/** Collapse duplicate Raven Workspace Member rows for the same Frappe user (whitelist + resource merge). */
export function dedupeRavenWorkspaceMembersByUser(
  members: RavenWorkspaceMemberRow[]
): RavenWorkspaceMemberRow[] {
  const byUser = new Map<string, RavenWorkspaceMemberRow>();
  for (const m of members) {
    const key = (m.user || '').trim().toLowerCase() || String(m.name || '').trim();
    if (!key) continue;
    const prev = byUser.get(key);
    if (!prev) {
      byUser.set(key, m);
      continue;
    }
    const score = (row: RavenWorkspaceMemberRow) =>
      (ravenWorkspaceMemberIsAdmin(row) ? 2 : 0) + (ravenWorkspaceMemberIsSupplier(row) ? 1 : 0);
    byUser.set(key, score(m) >= score(prev) ? m : prev);
  }
  return Array.from(byUser.values());
}

/** Members with **`custom_is_supplier`** set, sorted by `user` (supplier roster for a workspace). */
export function ravenWorkspaceSuppliersSorted(members: RavenWorkspaceMemberRow[]): RavenWorkspaceMemberRow[] {
  return members
    .filter((m) => ravenWorkspaceMemberIsSupplier(m))
    .sort((a, b) => String(a.user).localeCompare(String(b.user), undefined, { sensitivity: 'base' }));
}

/** Single pass for drawer UI: admin flag + member list (full directory, suppliers first). */
export function getRavenMemberDirectoryView(
  members: RavenWorkspaceMemberRow[],
  viewerEmail: string | null | undefined,
  viewerUserId: string | null | undefined
): { viewerIsWorkspaceAdmin: boolean; visibleMembers: RavenWorkspaceMemberRow[] } {
  const viewerIsWorkspaceAdmin = viewerIsRavenWorkspaceAdmin(members, viewerEmail, viewerUserId);
  return {
    viewerIsWorkspaceAdmin,
    visibleMembers: sortRavenMembersForDirectory(members),
  };
}
