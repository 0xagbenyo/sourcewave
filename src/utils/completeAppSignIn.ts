import type { UserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import { joinAllPublicRavenWorkspacesAsSessionUser } from '../services/ravenNativeApi';
import { saveFrappeWebCredentials } from '../services/sessionCredentials';
import { detectSupplierPortalSession } from '../services/supplierPortal';

/** Log in with email/password and build the in-app user session (buyer or supplier). */
export async function completeAppSignIn(
  loginIdentifier: string,
  password: string
): Promise<UserSession> {
  const client = getERPNextClient();
  const loginResult = await client.login(loginIdentifier.trim(), password);

  try {
    await joinAllPublicRavenWorkspacesAsSessionUser();
  } catch (e) {
    console.warn('Could not join all public Raven workspaces:', e);
  }

  const userEmail = loginResult.user || loginIdentifier.trim();
  let customerId = userEmail;
  let customerDisplayName = loginResult.full_name || undefined;

  try {
    const customer = await client.getCustomerByEmail(userEmail);
    if (customer?.name) {
      customerId = String(customer.name).trim();
    }
    if (customer?.customer_name) {
      customerDisplayName = String(customer.customer_name);
    }
  } catch (e) {
    console.warn('Could not fetch customer by email:', e);
  }

  const frappeUserName = String(loginResult.user || loginIdentifier).trim();
  let portal: Awaited<ReturnType<typeof detectSupplierPortalSession>> | null = null;
  try {
    portal = await detectSupplierPortalSession(userEmail, frappeUserName);
  } catch (e) {
    console.warn('Supplier portal detection failed:', e);
  }

  let session: UserSession;
  if (portal?.isSupplier) {
    const supplierDoc = portal.supplierId?.trim() || '';
    session = {
      email: userEmail,
      fullName: portal.supplierName || customerDisplayName || loginResult.full_name,
      user: frappeUserName || userEmail,
      appMode: 'supplier',
      supplierId: supplierDoc || undefined,
      supplierName: portal.supplierName,
    };
  } else {
    session = {
      email: userEmail,
      fullName: customerDisplayName,
      user: customerId,
      appMode: 'buyer',
    };
  }

  try {
    await saveFrappeWebCredentials(userEmail, password);
  } catch (credErr) {
    console.warn('Could not save credentials for Raven auto-login:', credErr);
  }

  return session;
}
