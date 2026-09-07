import type { Metadata } from "next";
import { Cinzel, Marcellus } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-cinzel",
});

const marcellus = Marcellus({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-marcellus",
});

export const metadata: Metadata = {
  title: "Talent Forge — Branching Talent Tree",
  description:
    "Organise your goals as a decorated, WoW-inspired branching talent tree of steel text boxes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${cinzel.variable} ${marcellus.variable}`}>
        {children}
      </body>
    </html>
  );
}
