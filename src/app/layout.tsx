import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CartHydrator } from "@/features/cart/components/cart-hydrator";
import { CartLiveRegion } from "@/features/cart/components/live-region";
import { SiteHeader } from "./site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shop",
  description: "Browse and shop products",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <CartHydrator />
        <SiteHeader />
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <CartLiveRegion />
      </body>
    </html>
  );
}
