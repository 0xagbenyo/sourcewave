import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en as Record<string, unknown> },
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh'],
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
  react: {
    useSuspense: false,
  },
});

export default i18n;
