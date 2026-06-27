import { getERPNextClient } from './erpnext';
import type { UserSession } from '../context/UserContext';
import { isGhanaPhoneLoginIdentifier, isUsernameLoginIdentifier } from '../utils/loginIdentifier';

export type SupplierPortalDetection = {
  isSupplier: boolean;
  supplierId?: string;
  supplierName?: string;
  roles: string[];
};

/**
 * Supplier portal: Frappe **Supplier** role and/or a **Supplier** document linked via
 * `email_id` or **Supplier Portal User** child row.
 */
export async function detectSupplierPortalSession(
  userEmail: string,
  frappeUserName: string
): Promise<SupplierPortalDetection> {
  const client = getERPNextClient();
  let email = userEmail.trim();
  let usr = frappeUserName.trim();

  if (
    !email.includes('@') &&
    (isGhanaPhoneLoginIdentifier(email) ||
      isGhanaPhoneLoginIdentifier(usr) ||
      isGhanaPhoneLoginIdentifier(usr.replace(/\s/g, '')))
  ) {
    const phone = isGhanaPhoneLoginIdentifier(email) ? email : usr;
    try {
      const row = await client.getUserByPhone(phone);
      if (row?.name) {
        usr = String(row.name).trim();
        email = String(row.email || row.name).trim();
      }
    } catch {
      // continue with original identifiers
    }
  } else if (
    (isUsernameLoginIdentifier(email) || isUsernameLoginIdentifier(usr)) &&
    !email.includes('@')
  ) {
    const username = isUsernameLoginIdentifier(email) ? email : usr;
    try {
      const row = await client.getUserByUsername(username);
      if (row?.name) {
        usr = String(row.name).trim();
        email = String(row.email || row.name).trim();
      }
    } catch {
      // continue with original identifiers
    }
  }

  let roles: string[] = [];
  try {
    roles = await client.getRolesForUser(usr);
  } catch {
    roles = [];
  }
  if (!roles.length && email && email.toLowerCase() !== usr.toLowerCase()) {
    try {
      roles = await client.getRolesForUser(email);
    } catch {
      roles = [];
    }
  }

  let supplier: { name: string; supplier_name: string } | null = null;
  try {
    supplier = await client.findSupplierForPortalUser(email, usr);
  } catch {
    supplier = null;
  }

  const hasSupplierRole = roles.some((r) => r === 'Supplier');
  const isSupplier = hasSupplierRole || !!supplier;

  return {
    isSupplier,
    supplierId: supplier?.name,
    supplierName: supplier?.supplier_name,
    roles,
  };
}

/**
 * ERPNext **Supplier** document `name` for API calls (Purchase Order, Supplier Quotation, etc.).
 * Uses session `supplierId` when set at login; otherwise resolves via {@link findSupplierForPortalUser}
 * (including **Portal User** rows under Supplier).
 */
export async function getSupplierDocumentIdForApi(
  session: Pick<UserSession, 'email' | 'user' | 'supplierId'> | null | undefined
): Promise<string | null> {
  if (!session) return null;
  const direct = session.supplierId?.trim();
  if (direct) return direct;
  const email = String(session.email || '').trim();
  const usr = String(session.user || '').trim() || email;
  if (!email && !usr) return null;
  const client = getERPNextClient();
  const found = await client.findSupplierForPortalUser(email, usr);
  return found?.name?.trim() || null;
}
