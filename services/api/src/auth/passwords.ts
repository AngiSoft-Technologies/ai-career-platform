import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Key derivation parameters.
 *
 * scrypt with N=2^15 costs roughly 60-100 ms per verification on a shared
 * CPU. That is expensive enough to make offline cracking costly and cheap
 * enough to keep sign-in responsive.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export interface PasswordHash {
  hash: string;
  salt: string;
}

/** Hashes a password with a fresh random salt. */
export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return {
    hash: derived.toString("base64"),
    salt: salt.toString("base64"),
  };
}

/**
 * Verifies a password against a stored hash.
 *
 * The comparison is constant time, and a missing or malformed credential is
 * still hashed so that a wrong email and a wrong password take the same time.
 */
export async function verifyPassword(
  password: string,
  stored: { hash: string; salt: string } | null,
): Promise<boolean> {
  if (!stored) {
    // Burn the same work so the response time does not reveal whether the
    // email exists.
    await scrypt(password, randomBytes(SALT_LENGTH), KEY_LENGTH);
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(stored.hash, "base64");
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;

  let salt: Buffer;
  try {
    salt = Buffer.from(stored.salt, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0) return false;

  const actual = await scrypt(password, salt, KEY_LENGTH);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface PasswordPolicyResult {
  ok: boolean;
  reason?: string;
}

/** The password policy the API enforces on every sign-up. */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, reason: "Password must be at least 8 characters" };
  }
  if (password.length > 200) {
    return { ok: false, reason: "Password must be at most 200 characters" };
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      ok: false,
      reason: "Password must contain at least one letter and one number",
    };
  }
  return { ok: true };
}
