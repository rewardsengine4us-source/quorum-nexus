"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cards", label: "Cards" },
  { href: "/routes", label: "Transfer Routes" },
  { href: "/award-search", label: "Award Search" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/redeem", label: "Redeem" },
  { href: "/email-settings", label: "Email" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  function exit() {
    localStorage.removeItem("qn_entered");
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-base-700/60 bg-base-950/90 backdrop-blur">
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
        <button
          onClick={exit}
          className="rounded-md border border-base-700 px-3 py-1.5 text-xs text-slate-400 hover:border-base-700 hover:text-slate-200"
        >
          Exit demo
        </button>
      </div>
    </header>
  );
}
