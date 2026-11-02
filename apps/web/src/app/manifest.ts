import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — AI career platform for jobs, CVs and application tracking`,
    short_name: SITE.name,
    description: SITE.shortDescription,
    id: SITE.url,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070b14",
    theme_color: "#070b14",
    lang: SITE.language,
    dir: "ltr",
    categories: ["business", "productivity", "education"],
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/logo-mark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Search opportunities",
        short_name: "Find jobs",
        description: "Search live roles that fit your profile",
        url: "/opportunities",
        icons: [{ src: "/brand/logo-mark.png", sizes: "192x192" }],
      },
      {
        name: "My applications",
        short_name: "Applications",
        description: "Track application stages and follow-ups",
        url: "/applications",
        icons: [{ src: "/brand/logo-mark.png", sizes: "192x192" }],
      },
      {
        name: "My documents",
        short_name: "Documents",
        description: "Review your CVs and cover letters",
        url: "/documents",
        icons: [{ src: "/brand/logo-mark.png", sizes: "192x192" }],
      },
    ],
  };
}
