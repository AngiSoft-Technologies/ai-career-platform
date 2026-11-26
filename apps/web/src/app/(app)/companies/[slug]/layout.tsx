import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** Share metadata for a company detail link; no user data is included. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata({
    title: "Company profile",
    description: "Explore a company and its roles in MboQara.",
    path: `/companies/${encodeURIComponent(slug)}`,
    noindex: true,
    type: "website",
  });
}

export default function CompanyDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
