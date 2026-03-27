import type { Metadata } from "next";
import { Inter, Cormorant_Garamond, DM_Mono } from "next/font/google";
import { WalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Foundation | RWA Yield on Solana",
  description:
    "Institutional-grade RWA yield vaults on Solana. Deposit USDC, earn yield from real-world credit funds.",
  openGraph: {
    title: "Foundation | RWA Yield on Solana",
    description: "Institutional-grade RWA yield vaults on Solana.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable} ${dmMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <WalletProvider>
          <Navbar />
          <main className="pt-16">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
