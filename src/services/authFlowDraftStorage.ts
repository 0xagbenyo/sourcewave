import { appStorage } from './appStorage';
import {
  STORAGE_FORGOT_PASSWORD_DRAFT,
  STORAGE_SIGNUP_DRAFT,
} from '../constants/appPreferencesKeys';

export type SignupDraft = {
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  sourceValue: string;
  otherSource: string;
  otpStep: 'details' | 'verify';
  /** Unix ms when OTP was last sent — used to restore resend cooldown. */
  otpSentAt?: number;
};

export type ForgotPasswordDraft = {
  email: string;
  step: 'otp';
  otpSentAt?: number;
};

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await appStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await appStorage.setItem(key, JSON.stringify(value));
}

export async function loadSignupDraft(): Promise<SignupDraft | null> {
  const draft = await readJson<SignupDraft>(STORAGE_SIGNUP_DRAFT);
  if (!draft?.email?.trim()) return null;
  return draft;
}

export async function saveSignupDraft(draft: SignupDraft): Promise<void> {
  await writeJson(STORAGE_SIGNUP_DRAFT, draft);
}

export async function clearSignupDraft(): Promise<void> {
  await appStorage.removeItem(STORAGE_SIGNUP_DRAFT);
}

export async function loadForgotPasswordDraft(): Promise<ForgotPasswordDraft | null> {
  const draft = await readJson<ForgotPasswordDraft>(STORAGE_FORGOT_PASSWORD_DRAFT);
  if (!draft?.email?.trim() || draft.step !== 'otp') return null;
  return draft;
}

export async function saveForgotPasswordDraft(draft: ForgotPasswordDraft): Promise<void> {
  await writeJson(STORAGE_FORGOT_PASSWORD_DRAFT, draft);
}

export async function clearForgotPasswordDraft(): Promise<void> {
  await appStorage.removeItem(STORAGE_FORGOT_PASSWORD_DRAFT);
}

/** Remaining OTP resend cooldown seconds from a persisted send timestamp. */
export function otpCooldownSecondsRemaining(
  otpSentAt: number | undefined,
  cooldownSeconds: number
): number {
  if (!otpSentAt || !Number.isFinite(otpSentAt)) return 0;
  const elapsed = Math.floor((Date.now() - otpSentAt) / 1000);
  return Math.max(0, cooldownSeconds - elapsed);
}
