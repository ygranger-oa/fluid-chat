import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeInLocale } from "@/client/format";

describe("client date formatting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats relative time in French", () => {
    expect(formatRelativeInLocale("2026-09-10T10:00:00.000Z", "fr")).toBe("il y a 2 h");
  });
});
