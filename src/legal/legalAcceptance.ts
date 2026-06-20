import { appStorage } from '../services/appStorage';
import { STORAGE_LEGAL_ACCEPTANCE_VERSION } from '../constants/appPreferencesKeys';
import { LEGAL_ACCEPTANCE_VERSION } from './types';

export async function hasAcceptedLegalTerms(): Promise<boolean> {
  const stored = await appStorage.getItem(STORAGE_LEGAL_ACCEPTANCE_VERSION);
  return stored === LEGAL_ACCEPTANCE_VERSION;
}

export async function setLegalTermsAccepted(): Promise<void> {
  await appStorage.setItem(STORAGE_LEGAL_ACCEPTANCE_VERSION, LEGAL_ACCEPTANCE_VERSION);
}

export async function clearLegalTermsAcceptance(): Promise<void> {
  await appStorage.removeItem(STORAGE_LEGAL_ACCEPTANCE_VERSION);
}
