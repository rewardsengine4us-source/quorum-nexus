import { redirect } from "next/navigation";

// Redirect root to dashboard — no landing page, site is fully public now.
export default function LandingPage() {
  redirect("/dashboard");
}
