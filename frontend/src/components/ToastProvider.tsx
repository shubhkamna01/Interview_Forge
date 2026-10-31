import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastContext } from "./ToastContext";

interface ToastItem {
  id: number;
  kind: "success" | "error";
  message: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastItem["kind"], message: string) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({ success: (m: string) => push("success", m), error: (m: string) => push("error", m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            <span>{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
