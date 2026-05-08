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
  title: "Foundation: The financing layer for the AI super-cycle",
  description:
    "Index funds and managed RWA vaults on Solana. Compute Yield (FCY) — on-chain AI infrastructure debt — plus All-Weather Yield (AWY). USDC in, appreciating receipt token out, custodied via Squads multisig.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "Foundation: The financing layer for the AI super-cycle",
    description:
      "On-chain index funds for AI infrastructure debt and RWA yield. Compute Vault (FCY) + All-Weather Yield (AWY) on Solana.",
    type: "website",
    siteName: "Foundation",
  },
  twitter: {
    card: "summary",
    title: "Foundation: The financing layer for the AI super-cycle",
    description:
      "On-chain index funds for AI infrastructure debt and RWA yield. Compute Vault (FCY) + All-Weather Yield (AWY) on Solana.",
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
