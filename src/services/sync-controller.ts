import { checkCloudSyncAccess } from "./cloud-sync-access";
import type { CloudSyncResult } from "../types/sync";

const AUTHENTICATION_REQUIRED: CloudSyncResult = {
  status: "unauthenticated",
  syncedChanges: 0,
  receivedChanges: 0,
};

/**
 * Coordinates synchronization, retry timers, and recovery after reauthentication.
 *
 * @param synchronize Synchronization operation shared by all triggers
 * @param notify Callback for completed synchronization results
 * @returns Shared synchronization entry point and browser lifecycle registration
 */
export function createSyncController(
  synchronize: () => Promise<CloudSyncResult>,
  notify: (result: CloudSyncResult) => void,
) {
  const controller = new SyncController(synchronize, notify);
  return { run: () => controller.run(), start: () => controller.start() };
}

class SyncController {
  private inFlight: Promise<CloudSyncResult> | null = null;
  private authenticationCheck: Promise<void> | null = null;
  private authenticationBlocked = false;
  private retryTimer: number | null = null;
  private retryDelay = 1_000;
  private active = false;

  constructor(
    private readonly synchronize: () => Promise<CloudSyncResult>,
    private readonly notify: (result: CloudSyncResult) => void,
  ) {}

  run(): Promise<CloudSyncResult> {
    if (this.inFlight) return this.inFlight;
    if (this.authenticationBlocked) return Promise.resolve(AUTHENTICATION_REQUIRED);
    this.inFlight = this.synchronize()
      .then((result) => this.handleResult(result))
      .catch((error) => {
        this.scheduleRetry();
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  start() {
    if (typeof window === "undefined" || this.active) return () => {};
    this.active = true;
    const interval = window.setInterval(this.tick, 30_000);
    window.addEventListener("online", this.resume);
    window.addEventListener("focus", this.resume);
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.background();
    return () => {
      this.active = false;
      this.clearRetry();
      window.clearInterval(interval);
      window.removeEventListener("online", this.resume);
      window.removeEventListener("focus", this.resume);
      document.removeEventListener("visibilitychange", this.visibilityChanged);
    };
  }

  private clearRetry() {
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private scheduleRetry() {
    if (!this.active || this.retryTimer !== null) return;
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.background();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
  }

  private handleResult(result: CloudSyncResult) {
    if (result.status === "unauthenticated") {
      this.authenticationBlocked = true;
      this.clearRetry();
    } else if (result.status === "unavailable" || result.status === "deferred") {
      this.scheduleRetry();
    } else {
      this.clearRetry();
      this.retryDelay = 1_000;
    }
    this.notify(result);
    return result;
  }

  private background() {
    void this.run().catch((error) => console.warn("Background Cloud Sync is unavailable", error));
  }

  private resume = async () => {
    if (!this.active) return;
    if (this.authenticationBlocked) {
      this.authenticationCheck ??= checkCloudSyncAccess()
        .then((access) => {
          if (access.status === "authenticated") this.authenticationBlocked = false;
        })
        .finally(() => {
          this.authenticationCheck = null;
        });
      await this.authenticationCheck;
    }
    if (!this.active || this.authenticationBlocked) return;
    this.clearRetry();
    this.retryDelay = 1_000;
    this.background();
  };

  private visibilityChanged = () => {
    if (document.visibilityState === "visible") void this.resume();
  };

  private tick = () => {
    if (this.authenticationBlocked) void this.resume();
    else if (this.retryTimer === null) this.background();
  };
}
