import i18n from './index';

/**
 * Activates the bundled Simplified Chinese locale (src/locales/zh.json).
 * The Chinese pack ships with the app, so switching is instant and works offline.
 *
 * @returns true once the Chinese locale is active.
 */
export async function applyChineseLocale(): Promise<boolean> {
  await i18n.changeLanguage('zh');
  return true;
}

export async function applyEnglishLocale(): Promise<void> {
  await i18n.changeLanguage('en');
}

/**
 * Backwards-compatible alias. The Chinese locale is now a curated bundle
 * shipped with the app rather than a machine translation, so this simply
 * switches to the bundled `zh` resources.
 */
export async function ensureChineseMachineLocale(): Promise<boolean> {
  return applyChineseLocale();
}
