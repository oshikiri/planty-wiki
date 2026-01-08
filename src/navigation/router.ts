import { parseHashLocation, formatHashLocation, type Route } from "./route";

export type Router = {
  getCurrentRoute: () => Route | null;
  navigate: (route: Route) => void;
  subscribe: (listener: (route: Route | null) => void) => () => void;
};

/**
 * Builds a router backed by window.location.hash so the UI never manipulates location directly.
 *
 * @returns Router that listens to hashchange events
 */
export function createHashRouter(): Router {
  const listeners = new Set<(route: Route | null) => void>();
  const handleHashChange = () => {
    const nextRoute = parseHashLocation(window.location.hash);
    for (const listener of listeners) {
      listener(nextRoute);
    }
  };

  window.addEventListener("hashchange", handleHashChange);

  return {
    getCurrentRoute() {
      return parseHashLocation(window.location.hash);
    },
    navigate(route: Route) {
      window.location.hash = formatHashLocation(route);
    },
    subscribe(listener: (route: Route | null) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
