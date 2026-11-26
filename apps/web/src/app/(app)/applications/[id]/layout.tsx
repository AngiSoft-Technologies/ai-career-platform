import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * Application workspaces are private. Keep the share card generic and on the
 * collection route so no application id or user detail enters metadata.
 */
export const metadata = pageMetadata({
  title: "Application workspace",
  description:
    "Prepare documents, track status and manage follow-ups for a MboQara application.",
  path: "/applications",
  noindex: true,
  type: "website",
});

export default function ApplicationDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
