import type { Metadata } from "next";
import { Inter, Cormorant_Garamond, DM_Mono } from "next/font/google";
import { WalletProvider } from "@/components/WalletProvider";
import { Navbar } from "@/components/Navbar";
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
  title: "Foundation — Managed RWA Yield on Solana",
  description:
    "Deposit USDC into managed RWA vaults. Earn yield from Solomon basis trades, Kamino PRIME lending, and Drift levered credit. All on Solana via Squads multisig.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: "Foundation — Managed RWA Yield on Solana",
    description:
      "Deposit USDC into managed RWA vaults. Solomon, Kamino, Drift strategies on Solana.",
    type: "website",
    siteName: "Foundation",
    images: [{ url: "/banner.png", width: 1200, height: 630, alt: "Foundation — Managed RWA Yield on Solana" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Foundation — Managed RWA Yield on Solana",
    description:
      "Deposit USDC into managed RWA vaults. Solomon, Kamino, Drift strategies on Solana.",
    images: ["/banner.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable} ${dmMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Prevent flash: apply saved theme before paint */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch(e){}` }} />
      </head>
      <body className="min-h-screen antialiased">
        <NoiseBackground />
        <WalletProvider>
          <Navbar />
          <main className="pt-14">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
