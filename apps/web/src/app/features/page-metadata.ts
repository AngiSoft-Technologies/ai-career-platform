import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Features — Job Radar",
  description: "Find live jobs worldwide, tailor your resume and cover letter, and track every application. Built for job seekers.",
  openGraph: {
    title: "Features — Job Radar",
    description: "Find and apply to your dream job. Tailored resumes, cover letters and application tracking.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar features" }],
  },
};
