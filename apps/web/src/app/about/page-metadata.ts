import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Job Radar",
  description: "Job Radar helps you find real jobs worldwide, tailor resumes and cover letters, and track every application. Free during beta.",
  openGraph: {
    title: "About Job Radar",
    description: "Find and apply to your dream job with Job Radar.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};
