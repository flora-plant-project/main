import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en.json';
import ar from './ar.json';

export const LOCALE_STORAGE_KEY = 'flora-locale';
export const SUPPORTED_LOCALES = ['en', 'ar'];

/** Best guess for the first launch: the device language, if we support it. */
export function detectDeviceLocale() {
  const language = getLocales()[0]?.languageCode ?? 'en';
  return SUPPORTED_LOCALES.includes(language) ? language : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

/**
 * Switch language, mirror the layout direction, and persist the choice.
 * A live RTL flip needs an app reload on native — the flag applies on next boot.
 * @param {'en'|'ar'} locale
 */
export async function setLocale(locale) {
  const next = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  await i18n.changeLanguage(next);
  const rtl = next === 'ar';
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, next);
  return next;
}

/** Restore the persisted locale (or detect from the device) at app start. */
export async function initLocale() {
  let stored = null;
  try {
    stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // storage unavailable — fall back to the device locale
  }
  return setLocale(stored ?? detectDeviceLocale());
}

export default i18n;
