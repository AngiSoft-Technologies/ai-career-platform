import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

/**
 * TOTP (RFC 6238) implemented on the platform's own primitives.
 *
 * The secret is stored encrypted at rest — sealed with a key derived from
 * JWT_SECRET — because a TOTP secret is a bearer credential: anyone holding
 * it can mint valid codes forever. Encryption (rather than hashing) is
 * required because verification needs the secret itself.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
/** Accept the previous, current and next step to tolerate clock drift. */
const TOTP_WINDOW = 1;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function otpauthUrl(input: {
  issuer: string;
  account: string;
  secret: string;
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function verifyTotp(secret: string, code: string): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset += 1) {
    const candidate = hotp(key, counter + offset);
    if (safeEqual(candidate, normalized)) return true;
  }
  return false;
}

function hotp(key: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// ---------------------------------------------------------------------------
// Secret encryption at rest
// ---------------------------------------------------------------------------

function secretKey(): Buffer {
  return createHash("sha256").update(config.JWT_SECRET).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string): string | null {
  const [version, ivRaw, tagRaw, dataRaw] = payload.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !dataRaw) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secretKey(),
      Buffer.from(ivRaw, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Base32 (RFC 4648, no padding)
// ---------------------------------------------------------------------------

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
