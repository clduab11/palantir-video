import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const title = "TISE — Tactical Intelligence Synthesis Engine";
const description =
  "Commander-ready SITREP engine. Adversarial reasoning over SIGINT, HUMINT, and GEOINT. Provenance or it did not happen.";

function metadataBaseFromEnv(): URL {
  const hostOrUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    "http://127.0.0.1:4317";
  return new URL(
    hostOrUrl.startsWith("http://") || hostOrUrl.startsWith("https://")
      ? hostOrUrl
      : `https://${hostOrUrl}`,
  );
}

export const metadata: Metadata = {
  metadataBase: metadataBaseFromEnv(),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    images: ["/brand/tise-mark.png"],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/brand/tise-mark.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip bg-[#070b10] font-sans text-foreground">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
