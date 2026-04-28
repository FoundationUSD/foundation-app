import type { Metadata } from "next";
import { Inter, Cormorant_Garamond, DM_Mono } from "next/font/google";
import Script from "next/script";
import { WalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { NoiseBackground } from "@/components/NoiseBackground";
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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://fdnusd.com"),
  title: "Foundation: Managed RWA Yield on Solana",
  description:
    "Deposit USDC into managed RWA vaults. Earn yield from Solomon basis trades, Kamino PRIME lending, and Oro tokenized gold. All on Solana via Squads multisig.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "Foundation: Managed RWA Yield on Solana",
    description:
      "Deposit USDC into managed RWA vaults. Solomon, Kamino, Oro strategies on Solana.",
    type: "website",
    siteName: "Foundation",
  },
  twitter: {
    card: "summary",
    title: "Foundation: Managed RWA Yield on Solana",
    description:
      "Deposit USDC into managed RWA vaults. Solomon, Kamino, Oro strategies on Solana.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/* Prevent FOUC: apply saved theme before paint. next/script with
            beforeInteractive ensures it runs in <head> before React hydrates. */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
        >{`try{var d=document.documentElement,m=localStorage.getItem('darkMode');if(m==='true'){d.classList.remove('light')}else{d.classList.add('light')}}catch(e){document.documentElement.classList.add('light')}`}</Script>
        <NoiseBackground />
        <WalletProvider>
          <Navbar />
          <main className="relative z-10 min-h-screen pt-[100px]">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
