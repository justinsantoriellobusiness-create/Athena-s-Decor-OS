export const ENV = {
  // Session JWTs are signed and verified entirely by this server (Manus's
  // OAuth server is no longer in the loop), so appId only needs to be a
  // stable non-empty value — it doesn't need to match anything external.
  // sdk.ts's verifySession() rejects sessions with an empty appId, so
  // falling through to "" here silently broke every login.
  appId: process.env.VITE_APP_ID || "athenas-os",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  ZAPIER_EMBED_ID: process.env.ZAPIER_EMBED_ID ?? "",
  ZAPIER_API_SECRET: process.env.ZAPIER_API_SECRET ?? "",
  WIX_API_KEY: process.env.WIX_API_KEY ?? "",
  WIX_ACCOUNT_ID: process.env.WIX_ACCOUNT_ID ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
};
