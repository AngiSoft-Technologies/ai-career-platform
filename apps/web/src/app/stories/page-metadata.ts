import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stories — Job Radar",
  description: "Real stories from Job Radar users who found jobs, tailored resumes and tracked applications.",
  openGraph: {
    title: "Stories — Job Radar",
    description: "What Job Radar users are saying.",
    type: "website",
    images: [{ url: "/media/og-cover.jpg", width: 1200, height: 630, alt: "Job Radar" }],
  },
};
