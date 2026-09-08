import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SecureContent AI — Zero-Trust GenAI Content Transformation",
  description:
    "Security control plane for GenAI-powered content transformation. Detect PII, secrets and prompt injection, sanitize, transform with grounded GenAI, then validate output before release.",
  keywords: [
    "SecureContent AI",
    "GenAI security",
    "prompt injection",
    "PII detection",
    "secret scanning",
    "DLP",
    "content transformation",
    "OWASP LLM Top 10",
  ],
  authors: [{ name: "SecureContent AI" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "SecureContent AI",
    description: "Zero-Trust GenAI for Automated Content Transformation",
    siteName: "SecureContent AI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
