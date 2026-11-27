"use client";

import { useParams } from "next/navigation";
import { DocumentBuilder } from "@/components/documents/builder/DocumentBuilder";

/**
 * The document editor route.
 *
 * The builder owns the draft, so one instance is keyed by document id: it
 * remounts when a different document is opened and never shows the previous
 * document under the next document's title.
 */
export default function DocumentEditorPage() {
  const params = useParams<{ id: string }>();
  return <DocumentBuilder key={params.id} />;
}