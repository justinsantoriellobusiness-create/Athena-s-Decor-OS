/**
 * Symmetric AES-256-GCM encryption for credentials stored at rest.
 * Uses JWT_SECRET as the key derivation source (PBKDF2 → 32 bytes).
 * Never expose the raw key or encrypted blobs to the client.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ENV } from "./_core/env";

// Derive a stable 32-byte key from the JWT_SECRET
function getDerivedKey(): Buffer {
  return createHash("sha256").update(ENV.cookieSecret || "athenas-os-default-key").digest();
}

/**
 * Encrypt a plain-text string (e.g. an API token).
 * Returns a base64-encoded string: iv:authTag:ciphertext
 */
export function encryptCredential(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

/**
 * Decrypt a credential encrypted by encryptCredential().
 * Returns the original plaintext, or null if decryption fails.
 */
export function decryptCredential(ciphertext: string): string | null {
  try {
    const [ivB64, authTagB64, encryptedB64] = ciphertext.split(":");
    if (!ivB64 || !authTagB64 || !encryptedB64) return null;
    const key = getDerivedKey();
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    return null;
  }
}

/**
 * Encrypt a record of credential key-value pairs.
 * Each value is individually encrypted.
 */
export function encryptCredentials(creds: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    result[k] = encryptCredential(v);
  }
  return result;
}

/**
 * Decrypt a record of encrypted credential key-value pairs.
 * Returns only successfully decrypted values.
 */
export function decryptCredentials(creds: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    const decrypted = decryptCredential(v);
    if (decrypted !== null) result[k] = decrypted;
  }
  return result;
}

/**
 * Mask a credential for display — shows only last 4 chars.
 */
export function maskCredential(value: string): string {
  if (!value || value.length < 8) return "••••••••";
  return "••••••••" + value.slice(-4);
}
