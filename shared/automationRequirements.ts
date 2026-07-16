/**
 * What each automation module actually needs connected before it can do
 * real work. Shared between client (to grey out/explain a disabled toggle)
 * and server (to refuse enabling it at all) so the two can't drift —
 * previously a module could be flipped "on" and report success with
 * nothing behind it.
 */
export type ConnectionKey = "shopify" | "cjOrDsers" | "resend";

export const MODULE_REQUIREMENTS: Record<string, ConnectionKey[]> = {
  shopify: ["shopify"],
  seo: ["shopify"],
  blog: ["shopify"],
  inventory: ["shopify"],
  audit: ["shopify"],
  site_audit: ["shopify"],
  fulfillment: ["shopify", "cjOrDsers"],
  sourcing: [],
  product_sourcing: [],
  ads: [],
  accounting: [],
  backlinker: [],
  email_scraper: [],
  email_campaigns: ["resend"],
  ai_code_assistant: [],
};

export type ConnectionStatus = Record<ConnectionKey, boolean>;

export function unmetRequirements(module: string, status: ConnectionStatus): ConnectionKey[] {
  const required = MODULE_REQUIREMENTS[module] ?? [];
  return required.filter((key) => !status[key]);
}

export const CONNECTION_LABELS: Record<ConnectionKey, string> = {
  shopify: "Shopify",
  cjOrDsers: "CJ Dropshipping or DSers",
  resend: "Resend (email)",
};
