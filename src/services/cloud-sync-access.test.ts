import { describe, expect, it } from "vitest";

import { checkCloudSyncAccess } from "./cloud-sync-access";

describe("checkCloudSyncAccess", () => {
  it("Siteの利用可能状態を確認できた場合に認証済みの状態を返す", async () => {
    const state = await checkCloudSyncAccess(async () =>
      Response.json({ ready: true }, { status: 200 }),
    );

    expect(state).toEqual({ status: "authenticated" });
  });

  it("Siteがセッションを拒否した場合に未認証の状態を返す", async () => {
    const state = await checkCloudSyncAccess(async () =>
      Response.json({ error: "unauthorized" }, { status: 401 }),
    );

    expect(state).toEqual({ status: "unauthenticated" });
  });

  it("Cloud Sync APIが利用できない場合に利用不可の状態を返す", async () => {
    const state = await checkCloudSyncAccess(async () =>
      Response.json({ error: "storage_unavailable" }, { status: 503 }),
    );

    expect(state).toEqual({ status: "unavailable" });
  });

  it("ネットワーク障害時に例外を投げずに利用不可の状態を返す", async () => {
    const state = await checkCloudSyncAccess(async () => {
      throw new Error("network down");
    });

    expect(state).toEqual({ status: "unavailable" });
  });
});
