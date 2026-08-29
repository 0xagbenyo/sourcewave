import type { UserSession } from '../context/UserContext';
import { getErpNextUrl } from '../constants/env';
import { getFrappeWebCredentials } from '../services/sessionCredentials';
import {
  clearFrappeRavenSession,
  tryRestoreFrappeRavenSession,
} from '../services/frappeRavenSession';
import { completeAppSignIn } from './completeAppSignIn';

/** Re-authenticate with saved credentials and rebuild the Frappe session. */
export async function silentReloginFrappeSession(): Promise<boolean> {
  const creds = await getFrappeWebCredentials();
  if (!creds) return false;
  try {
    clearFrappeRavenSession();
    await completeAppSignIn(creds.email, creds.password);
    return true;
  } catch (e) {
    console.warn('[restoreAppSession] silent re-login failed', e);
    return false;
  }
}

/** Restore a saved user session and refresh the server-side Frappe login if needed. */
export async function bootstrapStoredAppSession(stored: UserSession): Promise<UserSession> {
  const baseUrl = getErpNextUrl();

  if (await tryRestoreFrappeRavenSession(baseUrl)) {
    return stored;
  }

  const creds = await getFrappeWebCredentials();
  if (!creds) {
    return stored;
  }

  try {
    clearFrappeRavenSession();
    return await completeAppSignIn(creds.email, creds.password);
  } catch (e) {
    console.warn('[restoreAppSession] bootstrap failed — keeping local session', e);
    return stored;
  }
}
