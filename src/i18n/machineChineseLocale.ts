import i18n from './index';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import { appStorage } from '../services/appStorage';
import {
  STORAGE_ZH_MACHINE_BUNDLE,
  STORAGE_ZH_MACHINE_BUNDLE_HASH,
} from '../constants/appPreferencesKeys';
import { djb2Hash, flattenStringLeaves, unflattenStringLeaves } from '../utils/flattenTranslations';
import { translateEnglishStringsToZhCN } from '../services/machineTranslateEnToZh';

const enHash = djb2Hash(JSON.stringify(en));

/**
 * Builds Simplified Chinese resources by machine-translating the English bundle,
 * with AsyncStorage cache keyed by English content hash.
 */
export async function ensureChineseMachineLocale(): Promise<void> {
  const cachedHash = await appStorage.getItem(STORAGE_ZH_MACHINE_BUNDLE_HASH);
  const cachedJson = await appStorage.getItem(STORAGE_ZH_MACHINE_BUNDLE);

  if (cachedHash === enHash && cachedJson) {
    try {
      const bundle = JSON.parse(cachedJson) as Record<string, unknown>;
      i18n.addResourceBundle('zh', 'translation', bundle, true, true);
      await i18n.changeLanguage('zh');
      return;
    } catch {
      // rebuild
    }
  }

  const { paths, values } = flattenStringLeaves(en as Record<string, unknown>);
  const translated =
    paths.length === 0 ? [] : await translateEnglishStringsToZhCN(values);
  const zhObj = unflattenStringLeaves(paths, translated) as Record<string, unknown>;

  await appStorage.setItem(STORAGE_ZH_MACHINE_BUNDLE, JSON.stringify(zhObj));
  await appStorage.setItem(STORAGE_ZH_MACHINE_BUNDLE_HASH, enHash);

  i18n.addResourceBundle('zh', 'translation', zhObj, true, true);
  await i18n.changeLanguage('zh');
}

export async function applyEnglishLocale(): Promise<void> {
  await i18n.changeLanguage('en');
}
