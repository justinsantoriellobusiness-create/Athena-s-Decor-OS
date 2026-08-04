import { describe, it, expect, vi } from "vitest";
import {
  classifyOrder,
  isMonthlyPlugLineItem,
  buildHandoffPayload,
  signPayload,
  verifySignature,
  routeOrder,
  EMPTY_RULES,
  DEFAULT_MONTHLY_PLUG_RULES,
  MONTHLY_PLUG_ROUTED_TAG,
  MONTHLY_PLUG_SPLIT_TAG,
  MONTHLY_PLUG_FAILED_TAG,
  type OrderRoutingRules,
  type OrderRoutingConfig,
} from "./orderRouting";

vi.mock("./db", () => ({
  getAutomationSetting: vi.fn(),
  updateAutomationSetting: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

const rules = (over: Partial<OrderRoutingRules> = {}): OrderRoutingRules => ({
  ...EMPTY_RULES,
  ...over,
});

const mpItem = { product_id: 1, sku: "MP-BONG-01", vendor: "Monthly Plug", quantity: 1 };
const athenaItem = { product_id: 2, sku: "AD-VASE-9", vendor: "Athena's Decor", quantity: 1 };

describe("isMonthlyPlugLineItem", () => {
  it("matches on vendor, case-insensitively", () => {
    expect(isMonthlyPlugLineItem(mpItem, rules({ vendors: ["monthly plug"] }))).toBe(true);
    expect(isMonthlyPlugLineItem(athenaItem, rules({ vendors: ["monthly plug"] }))).toBe(false);
  });

  it("matches on SKU prefix, case-insensitively", () => {
    expect(isMonthlyPlugLineItem(mpItem, rules({ skuPrefixes: ["mp-"] }))).toBe(true);
    expect(isMonthlyPlugLineItem(athenaItem, rules({ skuPrefixes: ["mp-"] }))).toBe(false);
  });

  it("matches an explicit product id", () => {
    expect(isMonthlyPlugLineItem(mpItem, rules({ productIds: ["1"] }))).toBe(true);
    expect(isMonthlyPlugLineItem(mpItem, rules({ productIds: ["999"] }))).toBe(false);
  });

  it("does not match anything when no rules are configured", () => {
    expect(isMonthlyPlugLineItem(mpItem, EMPTY_RULES)).toBe(false);
  });

  it("ignores empty vendor/sku rather than treating them as a wildcard match", () => {
    const blank = { product_id: 3, sku: "", vendor: "" };
    expect(isMonthlyPlugLineItem(blank, rules({ vendors: [""], skuPrefixes: [""] }))).toBe(false);
  });
});

describe("classifyOrder", () => {
  const r = rules({ vendors: ["Monthly Plug"] });

  it("routes an all-Monthly-Plug order", () => {
    const c = classifyOrder({ line_items: [mpItem, { ...mpItem, product_id: 3 }] }, r);
    expect(c.verdict).toBe("monthly_plug");
    expect(c.monthlyPlugItems).toHaveLength(2);
  });

  it("leaves an all-Athena order alone", () => {
    expect(classifyOrder({ line_items: [athenaItem] }, r).verdict).toBe("athena");
  });

  it("flags a mixed-brand order instead of splitting it", () => {
    const c = classifyOrder({ line_items: [mpItem, athenaItem] }, r);
    expect(c.verdict).toBe("mixed");
    expect(c.monthlyPlugItems).toHaveLength(1);
    expect(c.athenaItems).toHaveLength(1);
  });

  it("returns empty for an order with no line items", () => {
    expect(classifyOrder({ line_items: [] }, r).verdict).toBe("empty");
  });

  it("treats an out-of-scope channel as Athena when a channel allowlist is set", () => {
    const scoped = rules({ vendors: ["Monthly Plug"], channels: ["ebay"] });
    expect(classifyOrder({ line_items: [mpItem], source_name: "web" }, scoped).verdict).toBe("athena");
    expect(classifyOrder({ line_items: [mpItem], source_name: "ebay" }, scoped).verdict).toBe("monthly_plug");
  });

  it("matches any channel when the allowlist is empty", () => {
    expect(classifyOrder({ line_items: [mpItem], source_name: "web" }, r).verdict).toBe("monthly_plug");
  });
});

describe("payload signing", () => {
  it("round-trips a signature", () => {
    const body = JSON.stringify({ a: 1 });
    expect(verifySignature(body, "secret", signPayload(body, "secret"))).toBe(true);
  });

  it("rejects a tampered body and a wrong secret", () => {
    const sig = signPayload(JSON.stringify({ a: 1 }), "secret");
    expect(verifySignature(JSON.stringify({ a: 2 }), "secret", sig)).toBe(false);
    expect(verifySignature(JSON.stringify({ a: 1 }), "other", sig)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifySignature("{}", "secret", "")).toBe(false);
    expect(verifySignature("{}", "secret", "zz")).toBe(false);
  });
});

describe("buildHandoffPayload", () => {
  it("carries a stable idempotency key and only the routed items", () => {
    const order = { id: 555, order_number: 1042, source_name: "ebay", line_items: [mpItem, athenaItem] };
    const payload = buildHandoffPayload(order, [mpItem]);
    expect(payload.idempotencyKey).toBe("athena-shopify-555");
    expect(buildHandoffPayload(order, [mpItem]).idempotencyKey).toBe(payload.idempotencyKey);
    expect(payload.order.lineItems).toHaveLength(1);
    expect(payload.order.lineItems[0].sku).toBe("MP-BONG-01");
  });
});

describe("routeOrder", () => {
  const config = (over: Partial<OrderRoutingConfig> = {}): OrderRoutingConfig => ({
    enabled: true,
    webhookUrl: "https://monthlyplug.example/intake",
    signingSecret: "shhh",
    rules: rules({ vendors: ["Monthly Plug"] }),
    ...over,
  });
  const order = { id: 7, order_number: 300, line_items: [mpItem] };

  it("no-ops entirely when routing is disabled", async () => {
    const applyTags = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await routeOrder(order, config({ enabled: false }), applyTags, []);
    expect(out.action).toBe("not_applicable");
    expect(applyTags).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("leaves ordinary Athena orders to the normal fulfillment path", async () => {
    const applyTags = vi.fn();
    const out = await routeOrder({ id: 8, order_number: 301, line_items: [athenaItem] }, config(), applyTags, []);
    expect(out.action).toBe("not_applicable");
    expect(applyTags).not.toHaveBeenCalled();
  });

  it("forwards a Monthly Plug order and tags it", async () => {
    const applyTags = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const out = await routeOrder(order, config(), applyTags, ["existing"]);
    expect(out).toEqual({ action: "routed", itemCount: 1 });
    expect(applyTags).toHaveBeenCalledWith("7", ["existing", MONTHLY_PLUG_ROUTED_TAG]);
    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-athena-idempotency-key"]).toBe("athena-shopify-7");
    expect((init?.headers as Record<string, string>)["x-athena-signature"]).toHaveLength(64);
    fetchSpy.mockRestore();
  });

  it("does not re-forward an order already routed", async () => {
    const applyTags = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await routeOrder(order, config(), applyTags, [MONTHLY_PLUG_ROUTED_TAG]);
    expect(out.action).toBe("already_routed");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("flags a mixed order for a human without forwarding it", async () => {
    const applyTags = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await routeOrder(
      { id: 9, order_number: 302, line_items: [mpItem, athenaItem] },
      config(),
      applyTags,
      []
    );
    expect(out.action).toBe("needs_manual_split");
    expect(applyTags).toHaveBeenCalledWith("9", [MONTHLY_PLUG_SPLIT_TAG]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("tags a failed handoff and reports the error instead of silently dropping the order", async () => {
    const applyTags = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 400 }));
    const out = await routeOrder(order, config(), applyTags, []);
    expect(out.action).toBe("failed");
    expect(applyTags).toHaveBeenCalledWith("7", [MONTHLY_PLUG_FAILED_TAG]);
    // 400 is permanent — it must not burn all three attempts.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it("clears the failure tag when a later retry succeeds", async () => {
    const applyTags = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const out = await routeOrder(order, config(), applyTags, [MONTHLY_PLUG_FAILED_TAG]);
    expect(out.action).toBe("routed");
    expect(applyTags).toHaveBeenCalledWith("7", [MONTHLY_PLUG_ROUTED_TAG]);
    fetchSpy.mockRestore();
  });

  it("fails closed when the webhook or secret is missing", async () => {
    const applyTags = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await routeOrder(order, config({ webhookUrl: "" }), applyTags, []);
    expect(out.action).toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("default brand rules", () => {
  const cases = [
    "Monthly Plug",
    "monthly plug",
    "MonthlyPlug",
    "monthly-plug",
    "MONTHLY PLUG",
    "Monthly  Plug",
    "Monthly Plug LLC",
    "Monthly Plug Wigs",
  ];
  for (const vendor of cases) {
    it(`matches vendor "${vendor}" without hand-configuration`, () => {
      expect(isMonthlyPlugLineItem({ vendor }, DEFAULT_MONTHLY_PLUG_RULES)).toBe(true);
    });
  }

  it("matches the MP- SKU prefix when vendor is blank", () => {
    expect(isMonthlyPlugLineItem({ vendor: "", sku: "MP-BONG-01" }, DEFAULT_MONTHLY_PLUG_RULES)).toBe(true);
  });

  it("does not sweep in Athena's Decor products", () => {
    for (const vendor of ["Athena's Decor", "Athenas Decor", "CJ Dropshipping", "AliExpress", "Plug", "Monthly"]) {
      expect(isMonthlyPlugLineItem({ vendor, sku: "AD-VASE-9" }, DEFAULT_MONTHLY_PLUG_RULES)).toBe(false);
    }
  });

  it("does not match a short rule by substring", () => {
    // "mp" normalizes to 2 chars — below the substring threshold, so a vendor
    // like "Lamp Co" must not match.
    expect(isMonthlyPlugLineItem({ vendor: "Lamp Co" }, { ...EMPTY_RULES, vendors: ["MP"] })).toBe(false);
  });
});
