import type { UserSession } from '../context/UserContext';
import { getERPNextClient } from '../services/erpnext';
import { joinAllPublicRavenWorkspacesAsSessionUser } from '../services/ravenNativeApi';
import { saveFrappeWebCredentials } from '../services/sessionCredentials';
import { detectSupplierPortalSession } from '../services/supplierPortal';
import {
  isGhanaPhoneLoginIdentifier,
  isEmailLoginIdentifier,
  isUsernameLoginIdentifier,
  normalizeLoginIdentifier,
  cleanPhoneInput,
} from './loginIdentifier';

/** Resolve Frappe User.name + email after login (phone logins may return phone as usr). */
export async function resolveLoggedInUserIdentity(
  client: ReturnType<typeof getERPNextClient>,
  loginResult: { user?: string; full_name?: string },
  loginIdentifier: string
): Promise<{ frappeUserName: string; email: string; fullName?: string }> {
  let frappeUserName = String(loginResult.user || loginIdentifier).trim();
  let fullName = loginResult.full_name;

  const phoneCandidate = [loginIdentifier, frappeUserName].find((v) =>
    isGhanaPhoneLoginIdentifier(v)
  );

  if (phoneCandidate) {
    try {
      const row = await client.getUserByPhone(phoneCandidate);
      if (row?.name) {
        frappeUserName = String(row.name).trim();
        const resolvedEmail = String(row.email || row.name || '').trim();
        return {
          frappeUserName,
          email: resolvedEmail.includes('@') ? resolvedEmail : frappeUserName,
          fullName: fullName || String(row.full_name || '').trim() || undefined,
        };
      }
    } catch (e) {
      console.warn('Could not resolve user by phone after login:', e);
    }
  } else if (isUsernameLoginIdentifier(loginIdentifier)) {
    try {
      const row = await client.getUserByUsername(loginIdentifier);
      if (row?.name) {
        frappeUserName = String(row.name).trim();
        const resolvedEmail = String(row.email || row.name || '').trim();
        return {
          frappeUserName,
          email: resolvedEmail.includes('@') ? resolvedEmail : frappeUserName,
          fullName: fullName || String(row.full_name || '').trim() || undefined,
        };
      }
    } catch (e) {
      console.warn('Could not resolve user by username after login:', e);
    }
  }

  if (frappeUserName.includes('@') || isEmailLoginIdentifier(frappeUserName)) {
    return { frappeUserName, email: frappeUserName, fullName };
  }

  return {
    frappeUserName,
    email: frappeUserName,
    fullName,
  };
}

function phoneLoginVariants(identifier: string): string[] {
  const cleaned = cleanPhoneInput(identifier);
  const variants = new Set<string>();
  variants.add(normalizeLoginIdentifier(identifier));
  variants.add(cleaned);
  if (cleaned.startsWith('0') && cleaned.length >= 10) {
    variants.add(`+233${cleaned.slice(1)}`);
    variants.add(`233${cleaned.slice(1)}`);
  }
  if (cleaned.startsWith('+233')) {
    variants.add(`0${cleaned.slice(4)}`);
    variants.add(cleaned.slice(1));
  }
  if (cleaned.startsWith('233') && !cleaned.startsWith('+')) {
    variants.add(`+${cleaned}`);
    variants.add(`0${cleaned.slice(3)}`);
  }
  return Array.from(variants).filter(Boolean);
}

async function loginWithIdentifier(
  client: ReturnType<typeof getERPNextClient>,
  identifier: string,
  password: string
) {
  const attempts = isGhanaPhoneLoginIdentifier(identifier)
    ? phoneLoginVariants(identifier)
    : [normalizeLoginIdentifier(identifier)];

  let lastError: unknown;
  for (const loginUsr of attempts) {
    try {
      return await client.login(loginUsr, password);
    } catch (error) {
      lastError = error;
    }
  }

  if (isGhanaPhoneLoginIdentifier(identifier)) {
    try {
      const user = await client.getUserByPhone(identifier);
      const frappeUserName = String(user?.name || '').trim();
      if (frappeUserName) {
        return await client.login(frappeUserName, password);
      }
    } catch (lookupError) {
      console.warn('Phone login user lookup failed:', lookupError);
    }
  }

  if (isUsernameLoginIdentifier(identifier)) {
    try {
      const user = await client.getUserByUsername(identifier);
      const frappeUserName = String(user?.name || '').trim();
      if (frappeUserName && frappeUserName !== identifier.trim()) {
        return await client.login(frappeUserName, password);
      }
    } catch (lookupError) {
      console.warn('Username login user lookup failed:', lookupError);
    }
  }

  throw lastError;
}

/** Log in with email, mobile, or username + password and build the in-app user session (buyer or supplier). */
export async function completeAppSignIn(
  loginIdentifier: string,
  password: string
): Promise<UserSession> {
  const client = getERPNextClient();
  const loginResult = await loginWithIdentifier(client, loginIdentifier, password);

  const identity = await resolveLoggedInUserIdentity(client, loginResult, loginIdentifier);
  const userEmail = identity.email;
  const frappeUserName = identity.frappeUserName;
  let customerDisplayName = identity.fullName || loginResult.full_name || undefined;

  // Join public Raven workspaces in the background — can be dozens of sequential API calls.
  void joinAllPublicRavenWorkspacesAsSessionUser().catch((e) => {
    console.warn('Could not join all public Raven workspaces:', e);
  });

  let customerId = frappeUserName;
  let portal: Awaited<ReturnType<typeof detectSupplierPortalSession>> | null = null;
  const [customer, portalResult] = await Promise.all([
    client.getCustomerByEmail(userEmail).catch((e) => {
      console.warn('Could not fetch customer by email:', e);
      return null;
    }),
    detectSupplierPortalSession(userEmail, frappeUserName).catch((e) => {
      console.warn('Supplier portal detection failed:', e);
      return null;
    }),
  ]);
  portal = portalResult;
  if (customer?.name) {
    customerId = String(customer.name).trim();
  }
  if (customer?.customer_name) {
    customerDisplayName = String(customer.customer_name);
  }

  let session: UserSession;
  if (portal?.isSupplier) {
    const supplierDoc = portal.supplierId?.trim() || '';
    session = {
      email: userEmail,
      fullName: portal.supplierName || customerDisplayName || loginResult.full_name,
      user: frappeUserName,
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

  void saveFrappeWebCredentials(userEmail, password).catch((credErr) => {
    console.warn('Could not save credentials for Raven auto-login:', credErr);
  });

  return session;
}
