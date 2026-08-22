"use client";

import { useState } from "react";

/**
 * Small brand mark for a bank, card issuer or loyalty programme.
 *
 * Sources are favicon-service URLs derived from each entity's own domain
 * rather than copies of brand assets, so nothing copyrighted is rehosted.
 * That service occasionally returns nothing for an obscure domain, so a
 * lettered fallback tile is rendered instead of a broken-image icon.
 *
 * Plain <img> rather than next/image: these are third-party hosts that
 * would each need whitelisting in next.config, and at 16-24px the
 * optimiser buys nothing.
 */
export default function Logo({
  src,
  name,
  size = 20,
}: {
  src?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
        className="inline-flex shrink-0 items-center justify-center rounded bg-base-700 font-medium text-slate-400"
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded object-contain"
    />
  );
}
