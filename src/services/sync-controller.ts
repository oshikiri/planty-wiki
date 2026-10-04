import { checkCloudSyncAccess } from "./cloud-sync-access";
import type { CloudSyncResult, SyncActivityStatus } from "../types/sync";

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
  return {
    run: () => controller.run(),
    start: () => controller.start(),
    getStatus: () => controller.getStatus(),
    subscribe: (listener: (status: SyncActivityStatus) => void) => controller.subscribe(listener),
  };
}

class SyncController {
  private inFlight: Promise<CloudSyncResult> | null = null;
  private authenticationCheck: Promise<void> | null = null;
  private authenticationBlocked = false;
  private retryTimer: number | null = null;
  private retryDelay = 1_000;
  private active = false;
  private status: SyncActivityStatus = "syncing";
  private readonly listeners = new Set<(status: SyncActivityStatus) => void>();

  constructor(
    private readonly synchronize: () => Promise<CloudSyncResult>,
    private readonly notify: (result: CloudSyncResult) => void,
  ) {}

  getStatus() {
    return this.status;
  }

  subscribe(listener: (status: SyncActivityStatus) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  run(): Promise<CloudSyncResult> {
    if (this.inFlight) return this.inFlight;
    if (this.authenticationBlocked) {
      this.setStatus("retrying");
      return Promise.resolve(AUTHENTICATION_REQUIRED);
    }
    this.setStatus("syncing");
    this.inFlight = this.synchronize()
      .then((result) => this.handleResult(result))
      .catch((error) => {
        this.scheduleRetry();
        this.setStatus("retrying");
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
      this.setStatus("retrying");
    } else if (result.status === "unavailable" || result.status === "deferred") {
      this.scheduleRetry();
      this.setStatus("retrying");
    } else {
      this.clearRetry();
      this.retryDelay = 1_000;
      this.setStatus("synced");
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

  private setStatus(status: SyncActivityStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }
}
