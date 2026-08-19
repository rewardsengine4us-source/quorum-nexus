"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Gates every app page behind a real Supabase session. Named
// RequireEntered rather than renamed to avoid touching the ~10 pages
// that import it under this name for what is otherwise a drop-in swap.
export default function RequireEntered({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (!session) {
        router.replace("/login");
      } else {
        setReady(true);
      }
    });

    // Covers the case where the session expires or the user signs out in
    // another tab while this page is open — bounce back to the sign-in
    // form instead of continuing to render pages against a dead session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/login");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
