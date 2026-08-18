import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quorum Nexus",
  description: "Credit card points transfer optimizer & redemption platform",
};

/**
 * Runs before first paint so the saved theme is applied without a flash of
 * the wrong colours. Kept inline (not a component) because anything that
 * waits for hydration is already too late.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("qn_theme");
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
    var root = document.documentElement;
    root.classList.add(theme);
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-base-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
