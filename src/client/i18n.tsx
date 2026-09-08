"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { UserPreferences } from "@/db/schema";
import { resolveLanguage, SUPPORTED_LANGUAGES, type LanguagePreference, type SupportedLanguage } from "./i18n-core";
import { en, type Messages } from "./locales/en";
import { fr } from "./locales/fr";

type Primitive = string | number;
const LANGUAGE_LABELS: Record<LanguagePreference, string> = {
  system: "Match browser",
  en: "English",
  fr: "Francais"
};

const messages = { en, fr } satisfies Record<SupportedLanguage, Messages>;

type DotPrefix<TPrefix extends string, TKey extends string> = `${TPrefix}.${TKey}`;
type DotKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : DotPrefix<K, DotKeys<T[K]>>
}[keyof T & string];
export type TranslationKey = DotKeys<Messages>;

function lookup(path: TranslationKey, language: SupportedLanguage) {
  return path.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, messages[language]) as string | undefined;
}

function interpolate(value: string, params?: Record<string, Primitive>) {
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

type I18nContextValue = {
  language: SupportedLanguage;
  languagePreference: LanguagePreference;
  languageOptions: Array<{ value: LanguagePreference; label: string }>;
  t: (key: TranslationKey, params?: Record<string, Primitive>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ preferences, children }: { preferences?: UserPreferences | null; children: ReactNode }) {
  const languagePreference = preferences?.language ?? "system";
  const language = resolveLanguage(preferences);
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      languagePreference,
      languageOptions: (["system", ...SUPPORTED_LANGUAGES] as LanguagePreference[]).map((entry) => ({
        value: entry,
        label: entry === "system" ? lookup("preferences.matchBrowser", language) ?? LANGUAGE_LABELS.system : LANGUAGE_LABELS[entry]
      })),
      t: (key, params) => interpolate(lookup(key, language) ?? lookup(key, "en") ?? key, params)
    }),
    [language, languagePreference]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
