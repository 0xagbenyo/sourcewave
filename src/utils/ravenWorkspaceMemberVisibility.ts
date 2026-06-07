import type { RavenWorkspaceMemberRow } from '../services/ravenNativeApi';

function normalizeId(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}

/**
 * Raven `fetch_workspace_members` marks workspace admins with `is_admin` (Check field).
 * The API may serialize that as number, boolean, or string depending on client / version.
 */
export function ravenWorkspaceMemberIsAdmin(m: RavenWorkspaceMemberRow): boolean {
  const v = m.is_admin as unknown;
  if (v === true || v === 1) return true;
  if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  }
  return false;
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

/** Admins first, then stable alphabetical by `user` (Raven User id / email). */
export function sortRavenMembersForDirectory(members: RavenWorkspaceMemberRow[]): RavenWorkspaceMemberRow[] {
  return [...members].sort((a, b) => {
    const da = ravenWorkspaceMemberIsAdmin(a) ? 0 : 1;
    const db = ravenWorkspaceMemberIsAdmin(b) ? 0 : 1;
    if (da !== db) return da - db;
    return String(a.user).localeCompare(String(b.user), undefined, { sensitivity: 'base' });
  });
}

/**
 * Returns the full workspace member list from the API (everyone in the workspace can DM anyone).
 * Previously non-admins only saw rows with `is_admin`, which dropped admins when `is_admin` was
 * serialized as a string or the viewer was not matched as admin.
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

/** Single pass for drawer UI: admin flag + member list (full directory, admins first). */
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
