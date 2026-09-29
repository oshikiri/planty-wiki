export type CloudSyncAccessState =
  | { status: "authenticated" }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const PROBE_PATH = "/api/sync/probe";

/**
 * Checks whether the current Site session can access the Cloud Sync API.
 *
 * @param fetcher Same-origin fetch implementation used to call the probe endpoint
 * @returns Cloud Sync access state for the current browser session
 */
export async function checkCloudSyncAccess(
  fetcher: Fetcher = globalThis.fetch.bind(globalThis),
): Promise<CloudSyncAccessState> {
  try {
    const response = await fetcher(PROBE_PATH, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!response.ok) {
      return response.status === 401 ? { status: "unauthenticated" } : { status: "unavailable" };
    }

    const payload: unknown = await response.json();
    return isReadyPayload(payload) ? { status: "authenticated" } : { status: "unavailable" };
  } catch (error) {
    console.warn("Cloud Sync access check is unavailable", error);
    return { status: "unavailable" };
  }
}

function isReadyPayload(value: unknown): value is { ready: true } {
  return Boolean(value && typeof value === "object" && "ready" in value && value.ready === true);
}
