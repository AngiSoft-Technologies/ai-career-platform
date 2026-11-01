import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find work that fits you | mboqara",
  description:
    "Find real jobs worldwide, tailor your resume and cover letter, and track every application in one place.",
  openGraph: {
    title: "mboqara",
    description: "Find the right opportunities. Shape strong applications. Move with clarity.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "mboqara" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "mboqara",
    description: "Find the right opportunities. Shape strong applications. Move with clarity.",
    images: ["/media/og-cover.jpg"],
  },
};
