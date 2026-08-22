// Public access — no auth gate. All pages are accessible to everyone.
// This component is now a pass-through for compatibility with existing imports.
export default function RequireEntered({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
