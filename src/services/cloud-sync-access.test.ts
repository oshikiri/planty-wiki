import { describe, expect, it } from "vitest";

import { checkCloudSyncAccess } from "./cloud-sync-access";

describe("checkCloudSyncAccess", () => {
  it("returns authenticated when the Site probe is ready", async () => {
    const state = await checkCloudSyncAccess(async () =>
      Response.json({ ready: true }, { status: 200 }),
    );

    expect(state).toEqual({ status: "authenticated" });
  });

  it("returns unauthenticated when the Site rejects the session", async () => {
    const state = await checkCloudSyncAccess(async () =>
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );

    expect(state).toEqual({ status: "unauthenticated" });
  });

  it("keeps local mode when the Cloud Sync API is unavailable", async () => {
    const state = await checkCloudSyncAccess(async () =>
      Response.json({ error: "storage_unavailable" }, { status: 503 }),
    );

    expect(state).toEqual({ status: "unavailable" });
  });

  it("treats a network failure as unavailable without breaking the app", async () => {
    const state = await checkCloudSyncAccess(async () => {
      throw new Error("network down");
    });

    expect(state).toEqual({ status: "unavailable" });
  });
});
