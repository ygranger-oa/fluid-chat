import { describe, expect, it } from "vitest";
import { addDays, normalizeChannelName, normalizeEmail, slugify, tokenHash } from "@/lib/security";

describe("security helpers", () => {
  it("normalizes emails and slugs", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(slugify(" My Great Workspace! ")).toBe("my-great-workspace");
  });

  it("normalizes channel display names without forcing slugs", () => {
    expect(normalizeChannelName(" Launch Plan 2026 🚀 ")).toBe("Launch Plan 2026 🚀");
    expect(normalizeChannelName("Qualité   labo")).toBe("Qualité labo");
    expect(normalizeChannelName("Ops <prod|secret>")).toBe("Ops prodsecret");
  });

  it("hashes tokens deterministically without exposing the token", () => {
    expect(tokenHash("secret-token")).toBe(tokenHash("secret-token"));
    expect(tokenHash("secret-token")).not.toBe("secret-token");
  });

  it("creates future timestamps", () => {
    expect(addDays(1).getTime()).toBeGreaterThan(Date.now());
  });
});
