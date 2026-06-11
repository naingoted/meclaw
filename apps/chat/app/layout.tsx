import { ThemeProvider } from "@meclaw/ui";
import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });
const sans = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });

const BOT_NAME = process.env.BOT_NAME ?? "meclaw";
const BOT_TAGLINE = process.env.BOT_TAGLINE ?? "Thet Naing's personal bot";

export const metadata: Metadata = {
  title: BOT_TAGLINE ? `${BOT_NAME} · ${BOT_TAGLINE}` : BOT_NAME,
  description: BOT_TAGLINE
    ? `Chat with ${BOT_NAME}, ${BOT_TAGLINE}, for answers, scheduling, and contact.`
    : `Chat with ${BOT_NAME} for answers, scheduling, and contact.`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${mono.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
