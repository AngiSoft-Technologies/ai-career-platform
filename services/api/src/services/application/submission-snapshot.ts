import { approvedDocumentSetFingerprint } from "./approval-fingerprint.js";

export interface SubmissionDocumentSnapshot {
  documentId: string;
  type: string;
  title: string;
  content: string;
  template: string;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Parses only the immutable snapshot shape stored with a submission run.
 * Malformed or legacy entries fail closed instead of falling back to a live
 * document row.
 */
export function mapSubmissionDocumentSnapshot(
  value: unknown,
): SubmissionDocumentSnapshot[] {
  return arrayValue(value).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const document = item as Record<string, unknown>;
    const documentId = typeof document.documentId === "string"
      ? document.documentId
      : typeof document.id === "string"
        ? document.id
        : "";
    if (!documentId) return [];
    return [{
      documentId,
      type: typeof document.type === "string" ? document.type : "",
      title: typeof document.title === "string" ? document.title : "",
      content: typeof document.content === "string" ? document.content : "",
      template: typeof document.template === "string"
        ? document.template
        : "classic",
    }];
  });
}

export function submissionSnapshotFingerprint(
  snapshot: SubmissionDocumentSnapshot[],
): string {
  return approvedDocumentSetFingerprint(snapshot.map((document) => ({
    id: document.documentId,
    type: document.type,
    title: document.title,
    template: document.template,
    content: document.content,
  })));
}

/**
 * Returns the snapshot only when it still matches the approval fingerprint
 * captured when the run was created.
 */
export function verifiedSubmissionSnapshotDocuments(
  value: unknown,
  approvedFingerprint: string | null,
): SubmissionDocumentSnapshot[] {
  if (!approvedFingerprint) return [];
  const snapshot = mapSubmissionDocumentSnapshot(value);
  if (snapshot.length === 0) return [];
  if (submissionSnapshotFingerprint(snapshot) !== approvedFingerprint) return [];
  return snapshot;
}

export function selectSubmissionSnapshotDocument(
  value: unknown,
  approvedFingerprint: string | null,
  documentId: string,
): SubmissionDocumentSnapshot | null {
  return verifiedSubmissionSnapshotDocuments(value, approvedFingerprint)
    .find((document) => document.documentId === documentId) ?? null;
}
