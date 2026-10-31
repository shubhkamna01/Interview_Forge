import { useEffect, useState } from "react";

export type View = "overview" | "drives" | "availability" | "rooms" | "schedule" | "notifications" | "profile";

const VIEWS: View[] = ["overview", "drives", "availability", "rooms", "schedule", "notifications", "profile"];

export interface Route {
  view: View;
  /** Path after the view, e.g. #/drives/abc/edit gives ["abc", "edit"]. */
  parts: string[];
}

function read(): Route {
  const [first, ...parts] = window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { view: VIEWS.includes(first as View) ? (first as View) : "overview", parts };
}

/**
 * Tiny hash router: the page lives in the URL (#/drives/<id>) so refresh and the back button work.
 * Pages the current role may not open fall back to the overview.
 */
export function useRoute(allowed: readonly View[]): Route {
  const [route, setRoute] = useState<Route>(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return allowed.includes(route.view) ? route : { view: "overview", parts: [] };
}

export const go = (path: string) => {
  window.location.hash = `#/${path}`;
};
