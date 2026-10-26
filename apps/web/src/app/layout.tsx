import type { Metadata, Viewport } from "next";
import { Archivo_Black, Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme";
import { ToastProvider } from "@/components/ui";
import { SessionProvider } from "@/components/session";
import { ServiceWorkerRegistrar } from "@/components/service-worker";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans-brand",
  display: "swap",
  preload: false,
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif-brand",
  display: "swap",
  preload: false,
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-brand",
  display: "swap",
  preload: false,
});

const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display-brand",
  display: "swap",
  preload: false,
});

const themeBoot = `(function(){try{var t=localStorage.getItem("jr.theme");if(t&&/^[a-z]+$/.test(t)){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: "Job Radar — Global job search, all professions",
    template: "%s · Job Radar",
  },
  description:
    "Job Radar aggregates global jobs across every profession, ranks them against your profile, prepares ATS-ready documents and helps you track applications. AI prepares, you review and submit.",
  applicationName: "Job Radar",
  category: "jobs",
  keywords: [
    "jobs",
    "career",
    "global jobs",
    "ATS resume",
    "cover letter",
    "application tracking",
    "AngiSoft",
  ],
  authors: [{ name: "AngiSoft Technologies" }],
  openGraph: {
    title: "Job Radar",
    description:
      "All jobs under one roof. Global coverage, every profession, AI-assisted applications you control.",
    type: "website",
    images: [{ url: "/brand/logo-wordmark.png", width: 1200, height: 338, alt: "Job Radar" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Job Radar",
    description: "All jobs under one roof — global coverage, every profession.",
    images: ["/brand/logo-wordmark.png"],
  },
  robots: { index: true, follow: true },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/logo-mark.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${display.variable}`}
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <ServiceWorkerRegistrar />
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>{children}</SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
