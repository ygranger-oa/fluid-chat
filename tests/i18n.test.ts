import { describe, expect, it } from "vitest";
import { detectBrowserLanguage, resolveLanguage } from "@/client/i18n-core";

describe("i18n language resolution", () => {
  it("uses an explicit user preference first", () => {
    expect(resolveLanguage({ language: "fr" }, ["en-US"])).toBe("fr");
    expect(resolveLanguage({ language: "en" }, ["fr-FR"])).toBe("en");
  });

  it("detects supported browser languages and regional variants", () => {
    expect(detectBrowserLanguage(["fr-FR", "en-US"])).toBe("fr");
    expect(detectBrowserLanguage(["en-GB"])).toBe("en");
  });

  it("falls back to English when no supported browser language matches", () => {
    expect(resolveLanguage({ language: "system" }, ["de-DE", "es-ES"])).toBe("en");
    expect(resolveLanguage(null, [])).toBe("en");
  });
});
