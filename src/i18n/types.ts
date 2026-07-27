export const SUPPORTED_LANGUAGES = ["uk", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
