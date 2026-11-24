import { createHash } from "node:crypto";

export interface ApprovedDocumentFingerprintInput {
  id: string;
  type: string;
  title: string;
  template: string;
  content: string;
}

/**
 * Fingerprints an approved document set without delimiter ambiguity.
 *
 * Each document is hashed independently and the fixed-length hashes are then
 * hashed as one set. Document text may contain any character, including the
 * separators used by simpler fingerprint strings.
 */
export function approvedDocumentSetFingerprint(
  documents: ApprovedDocumentFingerprintInput[],
): string {
  const documentHashes = documents.map((document) =>
    createHash("sha256")
      .update(JSON.stringify([
        document.id,
        document.type,
        document.title,
        document.template,
        document.content,
      ]))
      .digest("hex"),
  );
  return createHash("sha256")
    .update(documentHashes.join(""))
    .digest("hex");
}
