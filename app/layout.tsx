import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quorum Nexus",
  description: "Credit card points transfer optimizer & redemption platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-base-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
