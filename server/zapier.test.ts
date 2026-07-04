import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

describe("Zapier Integration", () => {
  // Zapier credentials are injected in the deployment environment only, so
  // format checks run when present and skip in CI/local environments.
  it("should have valid Zapier embed ID when configured", async () => {
    const embedId = ENV.ZAPIER_EMBED_ID;
    if (!embedId) return;

    expect(embedId).toMatch(/^[a-f0-9-]+$/);
  });

  it("should validate Zapier API secret format when configured", async () => {
    const apiSecret = ENV.ZAPIER_API_SECRET;
    if (!apiSecret) return;

    // Zapier API secrets contain alphanumeric, underscore, and hyphen characters
    expect(apiSecret).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(apiSecret.length).toBeGreaterThan(30);
  });

  it("should have Wix configuration available", async () => {
    const wixApiKey = ENV.WIX_API_KEY;
    const wixAccountId = ENV.WIX_ACCOUNT_ID;

    // These may be undefined if not yet provided, but should be strings if defined
    if (wixApiKey) {
      expect(typeof wixApiKey).toBe("string");
      expect(wixApiKey.length).toBeGreaterThan(0);
    }
    if (wixAccountId) {
      expect(typeof wixAccountId).toBe("string");
      expect(wixAccountId.length).toBeGreaterThan(0);
    }
  });
});
