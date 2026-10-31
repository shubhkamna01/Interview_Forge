import { useEffect, useState, type ReactNode } from "react";

interface Props {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
}

/** A button that asks "Are you sure?" with a second click, so destructive actions can't happen by accident. */
export function ConfirmButton({ onConfirm, children, confirmLabel = "Click again to confirm", className = "danger-button", disabled }: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${className}${armed ? " armed" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
