"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cards", label: "Cards" },
  { href: "/routes", label: "Transfer Routes" },
  { href: "/scan", label: "Scan" },
  { href: "/award-search", label: "Award Search" },
  { href: "/loyalty-sync", label: "Sync" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/redeem", label: "Redeem" },
  { href: "/email-settings", label: "Email" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  function exit() {
    localStorage.removeItem("qn_entered");
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-base-700/60 bg-base-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-accent-500" />
          Quorum Nexus
        </Link>
        <nav className="hidden gap-6 text-sm text-slate-300 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                pathname === l.href
                  ? "text-accent-400"
                  : "hover:text-slate-100 transition-colors"
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={exit}
            className="hidden rounded-md border border-base-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 md:block"
          >
            Exit demo
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-base-700 text-slate-300 md:hidden"
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="border-t border-base-700/60 bg-base-950 px-6 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`rounded-md px-2 py-2.5 text-sm ${
                  pathname === l.href
                    ? "bg-base-800 text-accent-400"
                    : "text-slate-300 hover:bg-base-800/60"
                }`}
              >
                {l.label}
              </Link>
            ))}
            <button
              onClick={exit}
              className="mt-2 rounded-md border border-base-700 px-2 py-2.5 text-left text-sm text-slate-400"
            >
              Exit demo
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
