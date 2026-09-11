import { describe, expect, it } from "vitest";
import { BUILD_VERSION } from "@/generated/build-info";
import { appVersion } from "@/server/services/app-version";

describe("app version", () => {
  it("uses the generated build version", () => {
    expect(appVersion()).toBe(BUILD_VERSION);
  });
});
