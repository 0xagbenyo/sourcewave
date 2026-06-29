import type { UserSession } from '../context/UserContext';

/** Logged-in user is on the supplier portal (not a retail buyer). */
export function isSupplierPortalUser(user: UserSession | null | undefined): boolean {
  return user?.appMode === 'supplier' || !!user?.supplierId?.trim();
}
