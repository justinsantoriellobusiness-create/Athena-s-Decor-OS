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
  // Shared secret for the Jarvis Command Center bridge (server/jarvisBridge.ts).
  // Must match the value Jarvis sends as `Authorization: Bearer <...>` — set
  // from whatever env var Jarvis's registry names for this business's
  // authEnvVar (e.g. ATHENAS_OS_API_KEY on the Command Center's side).
  jarvisBridgeApiKey: process.env.JARVIS_BRIDGE_API_KEY ?? "",
  // File storage: any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, etc).
  s3Bucket: process.env.S3_BUCKET_NAME ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  // AI image generation (blog featured images, ad creatives).
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  // Outbound transactional/marketing email delivery.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  // Public URL this server is reachable at, for tracking pixels/links
  // embedded in outbound emails. Railway sets RAILWAY_PUBLIC_DOMAIN
  // automatically; PUBLIC_BASE_URL overrides it if set explicitly.
  publicBaseUrl: (
    process.env.PUBLIC_BASE_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")
  ).replace(/\/+$/, ""),
};
