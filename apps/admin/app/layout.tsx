import type { Metadata } from "next";
import { JetBrains_Mono, Hanken_Grotesk } from "next/font/google";
import { ThemeProvider } from "@meclaw/ui";
import "./globals.css";

const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });
const sans = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "meclaw admin",
  description: "Admin console for meclaw — content, ingestion, and settings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${mono.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
