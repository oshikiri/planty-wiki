import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSyncController } from "./sync-controller";
import type { CloudSyncResult } from "../types/sync";

const idle: CloudSyncResult = { status: "idle", syncedChanges: 0, receivedChanges: 0 };
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("別のタブで認証が復旧した後に定期同期を再開する", async () => {
  const synchronize = vi
    .fn<() => Promise<CloudSyncResult>>()
    .mockResolvedValueOnce({ ...idle, status: "unauthenticated" })
    .mockResolvedValue(idle);
  const probe = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ready: true })));
  vi.stubGlobal("fetch", probe);
  const controller = createSyncController(synchronize, vi.fn());
  cleanups.push(controller.start());
  await vi.advanceTimersByTimeAsync(0);
  await expect(controller.run()).resolves.toMatchObject({ status: "unauthenticated" });
  expect(synchronize).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  expect(probe).toHaveBeenCalledOnce();
  expect(synchronize).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(synchronize).toHaveBeenCalledTimes(3);
});

it("認証確認が成功するまで未送信の変更を送信しない", async () => {
  const synchronize = vi
    .fn<() => Promise<CloudSyncResult>>()
    .mockResolvedValue({ ...idle, status: "unauthenticated" });
  const probe = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", probe);
  const controller = createSyncController(synchronize, vi.fn());
  cleanups.push(controller.start());
  await vi.advanceTimersByTimeAsync(60_000);
  await controller.run();
  expect(synchronize).toHaveBeenCalledOnce();
  expect(probe).toHaveBeenCalledTimes(2);
});

it("同時に発生した同期要求を一つにまとめる", async () => {
  let complete!: (result: CloudSyncResult) => void;
  const synchronize = vi.fn(
    () =>
      new Promise<CloudSyncResult>((resolve) => {
        complete = resolve;
      }),
  );
  const controller = createSyncController(synchronize, vi.fn());
  const first = controller.run();
  const second = controller.run();
  expect(synchronize).toHaveBeenCalledOnce();
  complete(idle);
  await expect(first).resolves.toEqual(idle);
  await expect(second).resolves.toEqual(idle);
});

it("同期中、再試行中、同期済みの状態を通知する", async () => {
  let complete!: (result: CloudSyncResult) => void;
  const synchronize = vi.fn(
    () =>
      new Promise<CloudSyncResult>((resolve) => {
        complete = resolve;
      }),
  );
  const controller = createSyncController(synchronize, vi.fn());
  const statuses: string[] = [];
  controller.subscribe((status) => statuses.push(status));

  const firstSync = controller.run();
  expect(controller.getStatus()).toBe("syncing");
  complete({ ...idle, status: "unavailable" });
  await firstSync;
  expect(controller.getStatus()).toBe("retrying");

  synchronize.mockResolvedValue({ ...idle, status: "synced" });
  await controller.run();
  expect(controller.getStatus()).toBe("synced");
  expect(statuses).toEqual(["retrying", "syncing", "synced"]);
});

it("定期同期でも待機時間を守りながら指数バックオフで再試行する", async () => {
  const synchronize = vi
    .fn<() => Promise<CloudSyncResult>>()
    .mockResolvedValue({ ...idle, status: "unavailable" });
  const controller = createSyncController(synchronize, vi.fn());
  cleanups.push(controller.start());
  await vi.advanceTimersByTimeAsync(0);
  expect(synchronize).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(synchronize).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(synchronize).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(27_000);
  expect(synchronize).toHaveBeenCalledTimes(5);
});
