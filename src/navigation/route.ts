import { formatHashFromPath, normalizePath } from "./index";
import { QUERY_PAGE_PATH } from "./constants";

export type Route = { type: "note"; path: string } | { type: "query" };

export const QUERY_ROUTE: Route = { type: "query" };

/**
 * location.hash文字列からRouteを復元し、未指定時はnullを返す。
 *
 * @param {string} hash window.location.hashから取得したハッシュ文字列
 * @returns {Route | null} hashが空の場合はnull
 */
export function parseHashLocation(hash: string): Route | null {
  const decoded = decodeHash(hash);
  if (!decoded) {
    return null;
  }
  const normalized = normalizePath(decoded);
  if (normalized === QUERY_PAGE_PATH) {
    return { type: "query" };
  }
  return { type: "note", path: normalized };
}

/**
 * Routeに応じてwindow.location.hashへセットできる文字列表現を生成する。
 *
 * @param {Route} route 遷移先
 * @returns {string} `#/pages/...`形式のハッシュ文字列
 */
export function formatHashLocation(route: Route): string {
  if (route.type === "query") {
    return formatHashFromPath(QUERY_PAGE_PATH);
  }
  return formatHashFromPath(route.path);
}

/**
 * `#`付きハッシュ文字列をデコードし、生のstringへ復元する。
 *
 * @param {string} hash window.location.hash値
 * @returns {string | null} デコード済みハッシュ。空の場合はnull
 */
function decodeHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
