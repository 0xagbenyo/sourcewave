import type { LegalDocument } from './types';
import { privacyPolicy } from './privacyPolicy';
import { termsAndConditions } from './termsAndConditions';
import { privacyPolicyZh } from './privacyPolicy.zh';
import { termsAndConditionsZh } from './termsAndConditions.zh';

function isChinese(lang?: string | null): boolean {
  return Boolean(lang && lang.toLowerCase().startsWith('zh'));
}

/**
 * Returns the Privacy Policy in the requested language, falling back to English.
 * English remains the authoritative legal text.
 */
export function getPrivacyPolicy(lang?: string | null): LegalDocument {
  return isChinese(lang) ? privacyPolicyZh : privacyPolicy;
}

/**
 * Returns the Terms & Conditions in the requested language, falling back to English.
 * English remains the authoritative legal text.
 */
export function getTermsAndConditions(lang?: string | null): LegalDocument {
  return isChinese(lang) ? termsAndConditionsZh : termsAndConditions;
}
