import type { AppRoute } from "../usecases/ports";

import type { Route } from "./route";

/**
 * Converts a navigation-layer route into a usecase-layer route representation.
 *
 * @param route Route used by the navigation layer, or null when route parsing failed
 * @returns Route shape used by the usecase layer
 */
export function mapNavigationRouteToApp(route: Route | null): AppRoute | null {
  if (!route) {
    return null;
  }
  if (route.type === "query") {
    return { kind: "query" };
  }
  return { kind: "note", path: route.path };
}

/**
 * Converts a usecase-layer route into a navigation-layer route representation.
 *
 * @param route Route used by the usecase layer
 * @returns Route shape used by the navigation layer
 */
export function mapAppRouteToNavigation(route: AppRoute): Route {
  if (route.kind === "query") {
    return { type: "query" };
  }
  return { type: "note", path: route.path };
}
