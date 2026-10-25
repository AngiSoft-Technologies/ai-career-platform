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
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif-brand",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-brand",
  display: "swap",
});

const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display-brand",
  display: "swap",
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
  },
  robots: { index: true, follow: true },
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/favicon.svg",
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
