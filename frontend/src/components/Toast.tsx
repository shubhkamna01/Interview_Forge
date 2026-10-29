import { useEffect } from "react";

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(id);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{message}</span>
      <button onClick={onClose} aria-label="Dismiss notification">×</button>
    </div>
  );
}
