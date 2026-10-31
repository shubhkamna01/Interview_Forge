import { useCallback, useState } from "react";
import { errorMessage } from "../api";
import { useToast } from "../components/useToast";

/** Runs a button action: tracks "busy", shows a success toast, and turns errors into an error toast. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await action();
        if (success) toast.success(success);
        return result;
      } catch (err) {
        toast.error(errorMessage(err));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  return { busy, run };
}
