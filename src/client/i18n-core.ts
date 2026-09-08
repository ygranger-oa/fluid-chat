import type { UserPreferences } from "@/db/schema";

export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = SupportedLanguage | "system";

export function detectBrowserLanguage(languages: readonly string[] = []) {
  for (const value of languages) {
    const normalized = value.toLowerCase();
    const base = normalized.split("-")[0];
    if (SUPPORTED_LANGUAGES.includes(normalized as SupportedLanguage)) return normalized as SupportedLanguage;
    if (SUPPORTED_LANGUAGES.includes(base as SupportedLanguage)) return base as SupportedLanguage;
  }
  return "en";
}

export function resolveLanguage(preferences?: UserPreferences | null, languages?: readonly string[]) {
  const preferred = preferences?.language;
  if (preferred && preferred !== "system") return preferred;
  const browserLanguages =
    languages ?? (typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);
  return detectBrowserLanguage(browserLanguages);
}
