import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// S Bonus UX is S Group's proprietary typeface; Figtree is the closest open fallback.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Money Trainer · S-Pankki",
  description: "Learn money the Duolingo way, with questions about your own S-Pankki finances.",
};

export const viewport: Viewport = {
  themeColor: "#004628",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
