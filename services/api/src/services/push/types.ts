/**
 * Provider-neutral push contract.
 *
 * The API never stores a raw device token in a readable column: registration
 * hashes it with SHA-256 and, when `PUSH_TOKEN_ENCRYPTION_KEY` is configured,
 * keeps an AES-GCM ciphertext solely for the adapter that delivers the push.
 * No adapter is handed a token it can log in clear text by accident — the
 * plaintext exists for the duration of one `send` call only.
 */

export const PUSH_PROVIDERS = ["fcm", "apns", "huawei", "samsung"] as const;

export type PushProvider = (typeof PUSH_PROVIDERS)[number];

export interface PushMessage {
  title: string;
  body: string;
  /** Aligns with device topics; an empty topic means a broadcast message. */
  topic?: string;
  /** Scalar-only payload (no email, name or token). */
  data?: Record<string, string>;
}

export interface PushDevice {
  provider: PushProvider;
  /** AES-GCM ciphertext, decrypted by the adapter immediately before send. */
  tokenCiphertext: string | null;
  /** Hash and hint are never used as delivery credentials. */
  tokenHash: string;
  tokenHint: string;
  deviceId: string;
  topics: string[];
}

export type PushOutcome = "sent" | "dry-run" | "skipped" | "failed";

export interface PushResult {
  provider: PushProvider;
  outcome: PushOutcome;
  reason?: string;
}

export interface PushAdapter {
  readonly provider: PushProvider;
  /** True only when real provider credentials are present in the environment. */
  isConfigured(): boolean;
  send(device: PushDevice, message: PushMessage): Promise<PushResult>;
}
