/**
 * Values the candidate must type themselves never leave the runtime.
 *
 * A remote browser cannot know whether a field is a password, an OTP or a
 * card number just from its label, so the runtime is deliberately conservative:
 * anything in these families is treated as manual-only and its value is
 * omitted from observations.
 */

const SENSITIVE_PATTERN =
  /(pass(word|phrase|code)?|otp|mfa|two.?factor|verif(y|ication)|card|cvv|cvc|security.?code|ssn|social.?security|legal|consent|terms|secret|pin|account.?number|iban|routing)/i;

export function isSensitiveField(label: string, key: string, type: string): boolean {
  return SENSITIVE_PATTERN.test(`${label} ${key} ${type}`);
}

export function redactValue(
  value: string | undefined,
  label: string,
  key: string,
  type: string,
): string | undefined {
  if (!value) return undefined;
  if (type === "password" || type === "file") return undefined;
  if (isSensitiveField(label, key, type)) return undefined;
  return value.slice(0, 500);
}

/** Best-effort scrubbing for text nodes that echo a sensitive value. */
export function redactVisibleText(text: string): string {
  return text
    .replace(/(?:\b\d[ -]?){13,19}\b/g, "[redacted card]")
    .replace(
      /^(\s*(?:password|passphrase|otp|mfa|verification code|security code|cvv|cvc|card number)\s*[:=]\s*)(.+)$/gim,
      "$1[redacted]",
    )
    .slice(0, 12_000);
}
