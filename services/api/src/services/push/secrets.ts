import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Optional envelope encryption for push tokens.
 *
 * `PUSH_TOKEN_ENCRYPTION_KEY` is a 32-byte key, base64 or hex encoded. When it
 * is absent the registry stays in dry-run mode and no raw token is persisted
 * at all — the SHA-256 hash and a short hint are still enough to deduplicate
 * registrations. The key's *value* is never logged or returned.
 */
let cachedKey: Buffer | null | undefined;

function encryptionKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.PUSH_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    cachedKey = null;
    return null;
  }
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    try {
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length === 32) key = decoded;
    } catch {
      key = null;
    }
  }
  cachedKey = key && key.length === 32 ? key : null;
  return cachedKey;
}

export function tokenEncryptionEnabled(): boolean {
  return encryptionKey() !== null;
}

export function encryptToken(token: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptToken(ciphertext: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const [version, ivPart, tagPart, payload] = ciphertext.split(".");
    if (version !== "v1" || !ivPart || !tagPart || !payload) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** Reads an environment credential without ever echoing its value. */
export function envCredential(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}
