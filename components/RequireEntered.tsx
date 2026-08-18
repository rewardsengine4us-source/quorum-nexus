"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// This app has no real authentication (dummy Enter gate, per product decision).
// This client-only guard just checks a local flag set when the user clicked
// "Enter" on the landing page, and bounces back there if it's missing.
export default function RequireEntered({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const entered = typeof window !== "undefined" && localStorage.getItem("qn_entered") === "true";
    if (!entered) {
      router.replace("/");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading Quorum Nexus…
      </div>
    );
  }

  return <>{children}</>;
}
