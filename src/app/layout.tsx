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
  title: "Secure Intelligence — Policy-Aware, Intelligence-Aware, Zero-Trust Transformation",
  description:
    "Secure Intelligence Content Transformation Platform: policy-aware transformation for audience-specific outputs, intelligence-aware extraction of entities/IOCs/TTPs/risks/evidence, and a zero-trust GenAI pipeline that treats every input and output as untrusted until validated.",
  keywords: [
    "SecureContent AI",
    "Secure Intelligence",
    "Policy-Aware Transformation",
    "Intelligence-Aware Extraction",
    "Zero-Trust GenAI",
    "IOCs",
    "TTPs",
    "MITRE ATT&CK",
    "OWASP LLM Top 10",
  ],
  authors: [{ name: "SecureContent AI" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Secure Intelligence — SecureContent AI",
    description: "Policy-Aware · Intelligence-Aware · Zero-Trust GenAI Content Transformation",
    siteName: "Secure Intelligence",
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
