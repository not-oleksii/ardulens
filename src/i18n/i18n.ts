import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import uk from "./locales/uk.json";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./types";

const STORAGE_KEY = "ardulens:lang";

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value ?? "");
}

function detectInitialLanguage(): SupportedLanguage {
  const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : "uk";
}

void i18n.use(initReactI18next).init({
  resources: {
    uk: { translation: uk },
    en: { translation: en },
  },
  lng: detectInitialLanguage(),
  fallbackLng: "uk",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  if (typeof localStorage !== "undefined" && isSupportedLanguage(lng)) {
    localStorage.setItem(STORAGE_KEY, lng);
  }
});

export default i18n;
