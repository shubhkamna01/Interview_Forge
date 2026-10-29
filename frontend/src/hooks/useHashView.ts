import { useEffect, useState } from "react";

export type View = "dashboard" | "candidates" | "interviewers" | "rooms" | "schedule";

const VIEWS: View[] = ["dashboard", "candidates", "interviewers", "rooms", "schedule"];

function read(): View {
  const hash = window.location.hash.replace(/^#\/?/, "") as View;
  return VIEWS.includes(hash) ? hash : "dashboard";
}

/** Tiny hash router: keeps the active page in the URL (#/schedule) with no extra dependency. */
export function useHashView(): View {
  const [view, setView] = useState<View>(read);

  useEffect(() => {
    const onChange = () => setView(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return view;
}
