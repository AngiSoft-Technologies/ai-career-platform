import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find work that fits you | Job Radar",
  description:
    "Find real jobs worldwide, tailor your resume and cover letter, and track every application in one place.",
  openGraph: {
    title: "Job Radar",
    description: "Find and apply to your dream job worldwide.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Job Radar",
    description: "Find and apply to your dream job worldwide.",
    images: ["/media/og-cover.jpg"],
  },
};
