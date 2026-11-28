import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * Share metadata only. The signed-in route stays private (no PII in the
 * title, description or image); the page itself is still noindex via the
 * parent app layout.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "Job opportunity",
    description:
      "Review a role, its fit factors and application guidance in MboQara.",
    path: `/workspace/opportunities/${encodeURIComponent(id)}`,
    noindex: true,
    type: "website",
  });
}

export default function OpportunityDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
