import type { ReactNode } from "react";

/** A label with its input (passed as children) and an optional hint underneath. */
export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
