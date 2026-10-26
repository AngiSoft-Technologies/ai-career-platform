import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your privacy and security — Job Radar",
  description: "Your data stays private. No sales, no training, no third-party access. Job Radar security for job seekers.",
  openGraph: {
    title: "Your privacy and security — Job Radar",
    description: "Your profile, resumes and documents are private to you. No sales, no training.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};
